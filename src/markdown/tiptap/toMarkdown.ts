import { unified } from "unified";
import remarkStringify from "remark-stringify";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import type {
  AlignType,
  BlockContent,
  Blockquote,
  Code,
  Heading,
  List,
  ListItem,
  Paragraph,
  PhrasingContent,
  Root,
  Table,
  TableRow,
} from "mdast";
import { normalizeTiptapDoc } from "./normalize.js";
import type { TiptapDoc, TiptapMark, TiptapNode } from "./types.js";
import { getBlock } from "../blocks/registry.js";

const compiler = unified()
  .use(remarkStringify, { bullet: "-", fence: "`", fences: true, rule: "-" })
  .use(remarkGfm)
  .use(remarkDirective);

// Documento TipTap → Markdown. Espejo de fromMarkdown.ts: mismos siete tipos
// de nodo base, mismas tres marcas en línea. `normalizeTiptapDoc` valida acá
// también, porque este documento puede venir del cliente (T4/T6) sin pasar
// nunca por fromMarkdown — no hay razón para confiar más en el JSON que
// llega por HTTP que en el que llega de un archivo .md.
export function toMarkdown(doc: TiptapDoc): string {
  const normalized = normalizeTiptapDoc(doc);
  const root: Root = { type: "root", children: (normalized.content ?? []).map(blockToMdast) };
  const text = compiler.stringify(root).trimEnd();
  // Un documento vacío (post recién creado, T5 de docs/slices/05.md) debe
  // volver a Markdown vacío, no a un salto de línea suelto.
  return text.length > 0 ? `${text}\n` : "";
}

// Exportada para que cada bloque rico (src/markdown/blocks/) convierta sus
// propios hijos (párrafos) de vuelta a mdast sin reimplementar esta lógica —
// mismo principio que blockFromMdast en fromMarkdown.ts.
export function blockToMdast(node: TiptapNode): BlockContent {
  switch (node.type) {
    case "paragraph":
      return paragraphToMdast(node);
    case "heading":
      return headingToMdast(node);
    case "blockquote":
      return blockquoteToMdast(node);
    case "bulletList":
      return listToMdast(node, false);
    case "orderedList":
      return listToMdast(node, true);
    case "codeBlock":
      return codeBlockToMdast(node);
    case "table":
      return tableToMdast(node);
    case "horizontalRule":
      return { type: "thematicBreak" };
    default: {
      const block = getBlock(node.type);
      if (!block) {
        throw new Error(`Nodo del editor visual no soportado en Markdown: ${node.type}`);
      }
      const directive = block.toMdast(node, blockToMdast);
      if (directive.type === "textDirective") {
        throw new Error(`Bloque en línea no soportado como nodo de bloque: ${node.type}`);
      }
      return directive;
    }
  }
}

function paragraphToMdast(node: TiptapNode): Paragraph {
  return { type: "paragraph", children: inlineToMdast(node.content ?? []) };
}

function headingToMdast(node: TiptapNode): Heading {
  const level = (node.attrs?.level as 1 | 2 | 3 | 4 | 5 | 6 | undefined) ?? 1;
  return { type: "heading", depth: level, children: inlineToMdast(node.content ?? []) };
}

function blockquoteToMdast(node: TiptapNode): Blockquote {
  return { type: "blockquote", children: (node.content ?? []).map(blockToMdast) };
}

function listToMdast(node: TiptapNode, ordered: boolean): List {
  const start = ordered ? ((node.attrs?.start as number | undefined) ?? 1) : null;
  return {
    type: "list",
    ordered,
    start,
    spread: false,
    children: (node.content ?? []).map(listItemToMdast),
  };
}

function listItemToMdast(node: TiptapNode): ListItem {
  return { type: "listItem", spread: false, checked: null, children: (node.content ?? []).map(blockToMdast) };
}

function codeBlockToMdast(node: TiptapNode): Code {
  const lang = (node.attrs?.language as string | undefined) ?? null;
  return { type: "code", lang, meta: null, value: textContent(node.content ?? []) };
}

function textContent(nodes: TiptapNode[]): string {
  return nodes.map((node) => node.text ?? "").join("");
}

function tableToMdast(node: TiptapNode): Table {
  const rows = node.content ?? [];
  const headerRow = rows[0];
  const align: AlignType[] = (headerRow?.content ?? []).map(
    (cell) => (cell.attrs?.align as AlignType | undefined) ?? null,
  );
  return { type: "table", align, children: rows.map(tableRowToMdast) };
}

function tableRowToMdast(row: TiptapNode): TableRow {
  return {
    type: "tableRow",
    children: (row.content ?? []).map((cell) => ({ type: "tableCell", children: cellInlineContent(cell) })),
  };
}

function cellInlineContent(cell: TiptapNode): PhrasingContent[] {
  const paragraph = cell.content?.[0];
  if (!paragraph || paragraph.type !== "paragraph") {
    throw new Error("Celda de tabla del editor visual sin párrafo");
  }
  return inlineToMdast(paragraph.content ?? []);
}

interface InlineRun {
  node: TiptapNode;
  marks: TiptapMark[];
}

// Orden de anidado, de afuera hacia adentro. ProseMirror ordena las marcas
// por el orden del esquema, que no es el que conviene para agrupar (dejaría
// el tachado como la más interna); el serializador fija el suyo.
const MARK_NESTING = ["link", "strike", "bold", "italic", "code"];

function markRank(mark: TiptapMark): number {
  const rank = MARK_NESTING.indexOf(mark.type);
  return rank === -1 ? MARK_NESTING.length : rank;
}

function inlineToMdast(nodes: TiptapNode[]): PhrasingContent[] {
  return groupRuns(
    nodes.map((node) => ({
      node,
      marks: node.type === "text" ? [...(node.marks ?? [])].sort((a, b) => markRank(a) - markRank(b)) : [],
    })),
  );
}

function sameMark(a: TiptapMark | undefined, b: TiptapMark): boolean {
  return a !== undefined && a.type === b.type && JSON.stringify(a.attrs ?? {}) === JSON.stringify(b.attrs ?? {});
}

// Los tramos contiguos que comparten la marca más externa van dentro de un
// mismo nodo mdast: sin esto, `~~**a** y *b*~~` saldría como tres tachados
// separados, uno de ellos con espacios en el borde (`~~ y ~~`), que
// Markdown no interpreta y el stringify termina escapando.
function groupRuns(runs: InlineRun[]): PhrasingContent[] {
  const result: PhrasingContent[] = [];
  let index = 0;
  while (index < runs.length) {
    const run = runs[index];
    const mark = run?.marks[0];
    if (!run || !mark) {
      result.push(inlineLeafToMdast(run?.node ?? { type: "text", text: "" }));
      index += 1;
      continue;
    }
    let end = index + 1;
    while (end < runs.length && sameMark(runs[end]?.marks[0], mark)) {
      end += 1;
    }
    const inner = runs.slice(index, end).map((item) => ({ node: item.node, marks: item.marks.slice(1) }));
    result.push(wrapMark(mark, inner));
    index = end;
  }
  return result;
}

function inlineLeafToMdast(node: TiptapNode): PhrasingContent {
  if (node.type === "image") {
    const alt = (node.attrs?.alt as string | undefined) ?? "";
    return {
      type: "image",
      url: (node.attrs?.src as string | undefined) ?? "",
      alt: alt.length > 0 ? alt : null,
      title: null,
    };
  }
  if (node.type === "hardBreak") {
    return { type: "break" };
  }
  if (node.type !== "text") {
    throw new Error(`Nodo en línea del editor visual no soportado en Markdown: ${node.type}`);
  }
  return { type: "text", value: node.text ?? "" };
}

// Las marcas de un nodo de texto de ProseMirror son un conjunto plano; acá
// se reconstruye el anidamiento de Markdown a partir de ese conjunto, en el
// orden de MARK_NESTING (más externa primero).
function wrapMark(mark: TiptapMark, inner: InlineRun[]): PhrasingContent {
  switch (mark.type) {
    case "bold":
      return { type: "strong", children: groupRuns(inner) };
    case "italic":
      return { type: "emphasis", children: groupRuns(inner) };
    case "strike":
      return { type: "delete", children: groupRuns(inner) };
    case "code":
      return { type: "inlineCode", value: inner.map((item) => item.node.text ?? "").join("") };
    case "link":
      return {
        type: "link",
        url: mark.attrs?.href as string,
        title: (mark.attrs?.title as string | undefined) ?? null,
        children: groupRuns(inner),
      };
    default:
      throw new Error(`Marca del editor visual no soportada en Markdown: ${mark.type}`);
  }
}

import { unified } from "unified";
import remarkStringify from "remark-stringify";
import remarkGfm from "remark-gfm";
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

const compiler = unified().use(remarkStringify, { bullet: "-", fence: "`", fences: true, rule: "-" }).use(remarkGfm);

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

function blockToMdast(node: TiptapNode): BlockContent {
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
    default:
      throw new Error(`Nodo del editor visual no soportado en Markdown: ${node.type}`);
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

function inlineToMdast(nodes: TiptapNode[]): PhrasingContent[] {
  return nodes.map(inlineNodeToMdast);
}

function inlineNodeToMdast(node: TiptapNode): PhrasingContent {
  if (node.type !== "text") {
    throw new Error(`Nodo en línea del editor visual no soportado en Markdown: ${node.type}`);
  }
  return wrapMarks(node.text ?? "", node.marks ?? []);
}

// Las marcas de un nodo de texto de ProseMirror son un conjunto plano; acá
// se reconstruye el anidamiento de Markdown a partir de ese conjunto, en el
// mismo orden (más externa primero) en que fromMarkdown.ts las acumula al
// bajar por el árbol — así ida y vuelta usan la misma convención de orden.
function wrapMarks(text: string, marks: TiptapMark[]): PhrasingContent {
  const [mark, ...rest] = marks;
  if (!mark) {
    return { type: "text", value: text };
  }

  switch (mark.type) {
    case "bold":
      return { type: "strong", children: [wrapMarks(text, rest)] };
    case "italic":
      return { type: "emphasis", children: [wrapMarks(text, rest)] };
    case "code":
      return { type: "inlineCode", value: text };
    case "link":
      return {
        type: "link",
        url: mark.attrs?.href as string,
        title: (mark.attrs?.title as string | undefined) ?? null,
        children: [wrapMarks(text, rest)],
      };
    default:
      throw new Error(`Marca del editor visual no soportada en Markdown: ${mark.type}`);
  }
}

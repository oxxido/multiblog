import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import type {
  AlignType,
  Code,
  Heading,
  Link,
  List,
  ListItem,
  PhrasingContent,
  RootContent,
  Table,
  TableRow,
} from "mdast";
import { normalizeTiptapDoc } from "./normalize.js";
import type { TiptapDoc, TiptapMark, TiptapNode } from "./types.js";
import { resolveBlock } from "../blocks/registry.js";

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkDirective);

// mdast → documento TipTap. Cubre los siete tipos de nodo base de
// docs/slices/05.md §0 (párrafo, encabezado, lista, enlace, código, cita,
// tabla) más negrita/itálica/código en línea, y delega los bloques ricos de
// S6 (`containerDirective`/`leafDirective`) al registro — un bloque nuevo no
// toca este archivo. Cualquier otra sintaxis no se descarta en silencio:
// lanza, porque perder contenido al abrir el editor visual sería romper el
// invariante 1 sin que nadie se entere.
export function fromMarkdown(markdown: string): TiptapDoc {
  const root = parser.parse(markdown);
  const doc: TiptapDoc = { type: "doc", content: root.children.map(blockFromMdast) };
  return normalizeTiptapDoc(doc);
}

export function blockFromMdast(node: RootContent): TiptapNode {
  switch (node.type) {
    case "paragraph":
      return { type: "paragraph", content: inlineFromMdast(node.children) };
    case "heading":
      return headingFromMdast(node);
    case "blockquote":
      return { type: "blockquote", content: node.children.map(blockFromMdast) };
    case "list":
      return listFromMdast(node);
    case "code":
      return codeBlockFromMdast(node);
    case "table":
      return tableFromMdast(node);
    case "containerDirective":
    case "leafDirective": {
      const { block, attrs } = resolveBlock(node);
      return block.fromMdast(node, attrs, blockFromMdast);
    }
    default:
      throw new Error(`Nodo de Markdown no soportado en el editor visual: ${node.type}`);
  }
}

function headingFromMdast(node: Heading): TiptapNode {
  return { type: "heading", attrs: { level: node.depth }, content: inlineFromMdast(node.children) };
}

function listFromMdast(node: List): TiptapNode {
  const content = node.children.map(listItemFromMdast);
  if (node.ordered) {
    const attrs = node.start !== null && node.start !== undefined && node.start !== 1 ? { start: node.start } : {};
    return { type: "orderedList", attrs, content };
  }
  return { type: "bulletList", content };
}

function listItemFromMdast(node: ListItem): TiptapNode {
  return { type: "listItem", content: node.children.map(blockFromMdast) };
}

function codeBlockFromMdast(node: Code): TiptapNode {
  const attrs = node.lang ? { language: node.lang } : {};
  const content = node.value.length > 0 ? [{ type: "text", text: node.value }] : [];
  return { type: "codeBlock", attrs, content };
}

function tableFromMdast(node: Table): TiptapNode {
  const align = node.align ?? [];
  const rows = node.children.map((row, index) => tableRowFromMdast(row, index === 0, align));
  return { type: "table", content: rows };
}

function tableRowFromMdast(row: TableRow, isHeader: boolean, align: AlignType[]): TiptapNode {
  const cellType = isHeader ? "tableHeader" : "tableCell";
  const cells = row.children.map((cell, index) => {
    const cellAlign = align[index];
    const attrs = cellAlign ? { align: cellAlign } : {};
    return {
      type: cellType,
      attrs,
      content: [{ type: "paragraph", content: inlineFromMdast(cell.children) }],
    };
  });
  return { type: "tableRow", content: cells };
}

function inlineFromMdast(nodes: PhrasingContent[], marks: TiptapMark[] = []): TiptapNode[] {
  const result: TiptapNode[] = [];
  for (const node of nodes) {
    result.push(...inlineNodeFromMdast(node, marks));
  }
  return result;
}

function inlineNodeFromMdast(node: PhrasingContent, marks: TiptapMark[]): TiptapNode[] {
  switch (node.type) {
    case "text":
      return [textNode(node.value, marks)];
    case "strong":
      return inlineFromMdast(node.children, [...marks, { type: "bold" }]);
    case "emphasis":
      return inlineFromMdast(node.children, [...marks, { type: "italic" }]);
    case "inlineCode":
      return [textNode(node.value, [...marks, { type: "code" }])];
    case "link":
      return inlineFromMdast(node.children, [...marks, linkMark(node)]);
    case "image":
      return [{ type: "image", attrs: { src: node.url, alt: node.alt ?? "" } }];
    default:
      throw new Error(`Marca de Markdown no soportada en el editor visual: ${node.type}`);
  }
}

function linkMark(node: Link): TiptapMark {
  const attrs: Record<string, unknown> = { href: node.url };
  if (node.title) {
    attrs.title = node.title;
  }
  return { type: "link", attrs };
}

function textNode(value: string, marks: TiptapMark[]): TiptapNode {
  return marks.length > 0 ? { type: "text", text: value, marks } : { type: "text", text: value };
}

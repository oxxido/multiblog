import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import type { RootContent } from "mdast";
import type { ContainerDirective, LeafDirective, TextDirective } from "mdast-util-directive";

export interface DirectiveShape {
  type: "containerDirective" | "leafDirective" | "textDirective";
  name: string;
  attrs: Record<string, string | null | undefined>;
}

const parser = unified().use(remarkParse).use(remarkGfm).use(remarkDirective);

function isDirectiveNode(node: RootContent): node is ContainerDirective | LeafDirective | TextDirective {
  return node.type === "containerDirective" || node.type === "leafDirective" || node.type === "textDirective";
}

function hasChildren(node: RootContent): node is RootContent & { children: RootContent[] } {
  return "children" in node && Array.isArray((node as { children?: unknown }).children);
}

function collectDirectiveShapes(nodes: RootContent[], shapes: DirectiveShape[]): void {
  for (const node of nodes) {
    if (isDirectiveNode(node)) {
      shapes.push({ type: node.type, name: node.name, attrs: node.attributes ?? {} });
    }
    if (hasChildren(node)) {
      collectDirectiveShapes(node.children, shapes);
    }
  }
}

export function extractDirectiveShape(markdown: string): DirectiveShape[] {
  const tree = parser.parse(markdown);
  const shapes: DirectiveShape[] = [];
  collectDirectiveShapes(tree.children, shapes);
  return shapes;
}

function shapesEqual(a: DirectiveShape, b: DirectiveShape): boolean {
  if (a.type !== b.type || a.name !== b.name) return false;
  const aKeys = Object.keys(a.attrs).sort();
  const bKeys = Object.keys(b.attrs).sort();
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key, index) => key === bKeys[index] && a.attrs[key] === b.attrs[key]);
}

export function directiveShapesMatch(a: DirectiveShape[], b: DirectiveShape[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((shape, index) => {
    const other = b[index];
    return other !== undefined && shapesEqual(shape, other);
  });
}

import type { Handler, Handlers } from "mdast-util-to-hast";
import type { DirectiveNode } from "./types.js";
import { resolveBlock } from "./registry.js";

// Un solo handler para los tres tipos de directiva de remark-directive: el
// nombre de la directiva (`node.name`) es lo único que distingue un bloque
// de otro, no el tipo de directiva. Añadir un bloque `containerDirective` o
// `leafDirective` nuevo no toca este archivo (docs/slices/06.md §0).
const handleDirective: Handler = (state, node) => {
  const directive = node as DirectiveNode;
  const { block, attrs } = resolveBlock(directive);
  return block.toHast(state, directive, attrs);
};

export const directiveHandlers: Handlers = {
  containerDirective: handleDirective,
  leafDirective: handleDirective,
  textDirective: handleDirective,
};

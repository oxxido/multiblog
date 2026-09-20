import type { ZodType } from "zod";
import type { Element } from "hast";
import type { State } from "mdast-util-to-hast";
import type { BlockContent, RootContent } from "mdast";
import type { ContainerDirective, LeafDirective, TextDirective } from "mdast-util-directive";
import type { AnyExtension } from "@tiptap/core";
import type { TiptapNode } from "../tiptap/types.js";

export type DirectiveType = "containerDirective" | "leafDirective" | "textDirective";

export type DirectiveNode = ContainerDirective | LeafDirective | TextDirective;

// Forma pública de un bloque rico (docs/DECISIONS.md, docs/slices/06.md §0):
// nombre, atributos validados con Zod, conversión a hast (una sola pasada de
// saneado con el resto del documento, de ahí que el `render` del pseudocódigo
// de SPEC.md §3 sea acá un handler de mdast-util-to-hast), nodo TipTap y
// conversión de ida y vuelta a Markdown. `Attrs` se borra a `unknown` al
// guardarse en el registro (src/markdown/blocks/registry.ts) — cada bloque
// sigue tipando sus propios atributos en su archivo.
// `convertChild`/`convertToMdast` son src/markdown/tiptap/fromMarkdown.ts
// (blockFromMdast) y toMarkdown.ts (blockToMdast) pasados por parámetro, no
// importados: un bloque con contenido genérico (`callout`) necesita esa
// conversión para sus párrafos, pero importar esos archivos desde acá
// formaría un ciclo (fromMarkdown.ts → normalize.ts → tiptap/extensions.ts →
// blocks/index.ts → este archivo). Pasarla como función evita el ciclo sin
// duplicar la lógica de conversión.
export interface BlockDefinition<Attrs = unknown> {
  readonly name: string;
  readonly directiveType: DirectiveType;
  readonly attrsSchema: ZodType<Attrs>;
  readonly tiptapNode: AnyExtension;
  toHast(state: State, node: DirectiveNode, attrs: Attrs): Element;
  fromMdast(node: DirectiveNode, attrs: Attrs, convertChild: (node: RootContent) => TiptapNode): TiptapNode;
  toMdast(node: TiptapNode, convertToMdast: (node: TiptapNode) => BlockContent): DirectiveNode;
}

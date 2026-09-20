import { z } from "zod";
import { Node, mergeAttributes } from "@tiptap/core";
import type { BlockDefinition } from "./types.js";

const calloutAttrsSchema = z.object({
  type: z.enum(["info", "warning", "success"]).default("info"),
});

type CalloutAttrs = z.infer<typeof calloutAttrsSchema>;

// Design.md §3.6 no fija copy de etiqueta por tipo, sólo "versalitas 11"
// (docs/slices/06.md §0): se decide acá, no hay otro lugar donde vivir.
const CALLOUT_LABELS: Record<CalloutAttrs["type"], string> = {
  info: "Nota",
  warning: "Atención",
  success: "Listo",
};

// `content: "paragraph+"` reutiliza el nodo `paragraph` que T1 de S5 ya
// convierte — ningún tipo de nodo nuevo dentro del contenido
// (docs/slices/06.md §0). `renderHTML` alcanza para que el editor visual
// pueda montar el nodo; el selector de `type` en la barra de herramientas es
// una NodeView que agrega src/admin-client/editor.ts (T4), sin tocar este
// esquema base.
const calloutTiptapNode = Node.create({
  name: "callout",
  group: "block",
  content: "paragraph+",
  addAttributes() {
    return {
      type: { default: "info" satisfies CalloutAttrs["type"] },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-callout]" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    const type = (node.attrs.type as CalloutAttrs["type"] | undefined) ?? "info";
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-callout": type, class: `callout callout--${type}` }),
      0,
    ];
  },
});

export const calloutBlock: BlockDefinition<CalloutAttrs> = {
  name: "callout",
  directiveType: "containerDirective",
  attrsSchema: calloutAttrsSchema,
  tiptapNode: calloutTiptapNode,

  toHast(state, node, attrs) {
    return {
      type: "element",
      tagName: "div",
      properties: { className: ["callout", `callout--${attrs.type}`] },
      children: [
        {
          type: "element",
          tagName: "p",
          properties: { className: ["callout__label"] },
          children: [{ type: "text", value: CALLOUT_LABELS[attrs.type] }],
        },
        ...state.all(node),
      ],
    };
  },

  fromMdast(node, attrs, convertChild) {
    return { type: "callout", attrs: { type: attrs.type }, content: node.children.map((child) => convertChild(child)) };
  },

  toMdast(node, convertToMdast) {
    const type = (node.attrs?.type as CalloutAttrs["type"] | undefined) ?? "info";
    return {
      type: "containerDirective",
      name: "callout",
      attributes: { type },
      children: (node.content ?? []).map((child) => convertToMdast(child)),
    };
  },
};

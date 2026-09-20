import { z } from "zod";
import { Node } from "@tiptap/core";
import type { Element } from "hast";
import type { BlockDefinition, DirectiveNode } from "./types.js";

const galleryAttrsSchema = z.object({
  cols: z.coerce.number().min(1).max(4).default(2),
});

type GalleryAttrs = z.infer<typeof galleryAttrsSchema>;

interface GalleryImage {
  src: string;
  alt: string;
}

// Un cuarto marco de registro por imagen (invariante de Design.md §4: los
// marcos `.blueprint` nunca pierden sus cuatro marcas), igual que el patrón
// ya usado en src/views/central-index.eta para las tarjetas de espacio.
function corners(): Element[] {
  return ["tl", "tr", "bl", "br"].map((corner) => ({
    type: "element",
    tagName: "i",
    properties: { className: ["corner", corner] },
    children: [],
  }));
}

// El pie de cada imagen es su propio `alt` (docs/DECISIONS.md, S6 §0): un
// `alt` vacío es una imagen decorativa, sin `<figcaption>`.
function frame(image: GalleryImage): Element {
  const children: Element["children"] = [
    ...corners(),
    { type: "element", tagName: "img", properties: { src: image.src, alt: image.alt }, children: [] },
  ];
  if (image.alt.length > 0) {
    children.push({
      type: "element",
      tagName: "figcaption",
      properties: {},
      children: [{ type: "text", value: image.alt }],
    });
  }
  return {
    type: "element",
    tagName: "figure",
    properties: { className: ["blueprint", "gallery__frame"] },
    children,
  };
}

// Markdown estándar pone cada `![]()` suelto en su propio párrafo; extraer
// las imágenes es ignorar esos párrafos envolventes, no una sintaxis nueva
// (docs/slices/06.md §0). No depende de que exista biblioteca de medios
// (S7): cualquier URL de imagen sirve, igual que hoy fuera de un `gallery`.
function extractImages(node: DirectiveNode): GalleryImage[] {
  const images: GalleryImage[] = [];
  for (const child of node.children) {
    if (child.type !== "paragraph") {
      continue;
    }
    for (const inline of child.children) {
      if (inline.type === "image") {
        images.push({ src: inline.url, alt: inline.alt ?? "" });
      }
    }
  }
  return images;
}

const galleryTiptapNode = Node.create({
  name: "gallery",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      images: { default: [] as GalleryImage[] },
      cols: { default: 2 },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-gallery]" }];
  },
  renderHTML({ node }) {
    const images = (node.attrs.images as GalleryImage[] | undefined) ?? [];
    return [
      "div",
      { "data-gallery": "", class: "gallery-placeholder" },
      `Galería · ${String(images.length)} imagen(es)`,
    ];
  },
});

export const galleryBlock: BlockDefinition<GalleryAttrs> = {
  name: "gallery",
  directiveType: "containerDirective",
  attrsSchema: galleryAttrsSchema,
  tiptapNode: galleryTiptapNode,

  toHast(_state, node, attrs) {
    const images = extractImages(node);
    return {
      type: "element",
      tagName: "div",
      properties: { className: ["gallery"] },
      children: [
        {
          type: "element",
          tagName: "div",
          properties: { className: ["gallery__grid"], style: `--gallery-cols: ${String(attrs.cols)}` },
          children: images.map(frame),
        },
      ],
    };
  },

  fromMdast(node, attrs) {
    return { type: "gallery", attrs: { images: extractImages(node), cols: attrs.cols } };
  },

  toMdast(node) {
    const images = (node.attrs?.images as GalleryImage[] | undefined) ?? [];
    const cols = (node.attrs?.cols as number | undefined) ?? 2;
    return {
      type: "containerDirective",
      name: "gallery",
      attributes: { cols: String(cols) },
      children: images.map((image) => ({
        type: "paragraph",
        children: [{ type: "image", url: image.src, alt: image.alt.length > 0 ? image.alt : null, title: null }],
      })),
    };
  },
};

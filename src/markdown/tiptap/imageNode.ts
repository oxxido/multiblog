import { Node } from "@tiptap/core";

// Imagen suelta en el cuerpo (`![alt](url)`, S7): sintaxis Markdown
// estándar, no un bloque rico de src/markdown/blocks/ (esos son directivas
// `:::nombre{}`), así que vive junto a los demás nodos base del editor
// (párrafo, encabezado, enlace...) en vez del registro de bloques.
export const imageNode = Node.create({
  name: "image",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes() {
    return {
      src: { default: "" },
      alt: { default: "" },
    };
  },
  parseHTML() {
    return [{ tag: "img[src]" }];
  },
  renderHTML({ node }) {
    return ["img", { src: node.attrs.src as string, alt: node.attrs.alt as string }];
  },
});

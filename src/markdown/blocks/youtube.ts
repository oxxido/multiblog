import { z } from "zod";
import { Node } from "@tiptap/core";
import type { BlockDefinition, DirectiveNode } from "./types.js";

const youtubeAttrsSchema = z.object({
  title: z.string().trim().min(1).default("Video de YouTube"),
});

type YoutubeAttrs = z.infer<typeof youtubeAttrsSchema>;

// `youtube` no tiene hijos: el id viene del `label` de la directiva
// (`::youtube[id]`), no de un atributo (docs/slices/06.md §0) — remark-directive
// lo entrega como el único hijo de texto de la directiva leaf.
function extractVideoId(node: DirectiveNode): string {
  const first = node.children[0];
  return first && "value" in first ? first.value : "";
}

// Tarjeta de verificación en vez de iframe embebido: el autor ve el id y un
// enlace a youtube.com sin cargar un documento de terceros dentro del propio
// editor (docs/slices/06.md §0).
const youtubeTiptapNode = Node.create({
  name: "youtube",
  group: "block",
  atom: true,
  addAttributes() {
    return {
      videoId: { default: "" },
      title: { default: "Video de YouTube" satisfies YoutubeAttrs["title"] },
    };
  },
  parseHTML() {
    return [{ tag: "a[data-youtube]" }];
  },
  renderHTML({ node }) {
    const videoId = (node.attrs.videoId as string | undefined) ?? "";
    return [
      "a",
      {
        "data-youtube": videoId,
        href: `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
        target: "_blank",
        rel: "noopener",
      },
      `YouTube: ${videoId}`,
    ];
  },
});

export const youtubeBlock: BlockDefinition<YoutubeAttrs> = {
  name: "youtube",
  directiveType: "leafDirective",
  attrsSchema: youtubeAttrsSchema,
  tiptapNode: youtubeTiptapNode,

  // Sin script propio (invariante 3): un <iframe> es HTML, no JS emitido por
  // este servidor. `-nocookie` y `loading="lazy"` son atributos planos.
  toHast(_state, node, attrs) {
    const videoId = extractVideoId(node);
    return {
      type: "element",
      tagName: "div",
      properties: { className: ["youtube-embed"] },
      children: [
        {
          type: "element",
          tagName: "iframe",
          properties: {
            src: `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`,
            title: attrs.title,
            loading: "lazy",
          },
          children: [],
        },
      ],
    };
  },

  fromMdast(node, attrs) {
    return { type: "youtube", attrs: { videoId: extractVideoId(node), title: attrs.title } };
  },

  toMdast(node) {
    const videoId = (node.attrs?.videoId as string | undefined) ?? "";
    const title = (node.attrs?.title as string | undefined) ?? "Video de YouTube";
    return {
      type: "leafDirective",
      name: "youtube",
      attributes: { title },
      children: [{ type: "text", value: videoId }],
    };
  },
};

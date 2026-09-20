import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkDirective from "remark-directive";
import remarkRehype from "remark-rehype";
import rehypeShiki from "@shikijs/rehype";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import rehypeStringify from "rehype-stringify";
import type { Schema } from "hast-util-sanitize";
import { directiveHandlers } from "./blocks/toHast.js";
import remarkMediaImages from "./mediaImages.js";
import "./blocks/index.js";

// Shiki emite `style` inline por token y una clase en el `<pre>`; el esquema
// por defecto de rehype-sanitize los elimina. Se amplía acotado a lo que el
// resaltado necesita, no se saltea el saneado. `figure`/`figcaption` los usa
// `gallery` (S6); `iframe` lo usa `youtube` (S6), acotado a `src`/`loading` —
// el resto de sus atributos (`width`, `height`, `title`) ya están en la
// lista `*`, y `src` hereda la restricción de protocolo http/https que
// rehype-sanitize ya aplica por defecto a esa propiedad. `img` gana
// `srcset`/`loading` (S7, docs/slices/07.md §0): `alt`/`width`/`height` ya
// están en la lista `*`.
const schema: Schema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), "figure", "figcaption", "iframe"],
  attributes: {
    ...defaultSchema.attributes,
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className", "style"],
    iframe: ["src", "loading"],
    img: [...(defaultSchema.attributes?.img ?? []), "srcset", "loading"],
  },
};

// remarkMediaImages corre entre remarkDirective y remarkRehype (S7 §0):
// mientras el árbol todavía es mdast, para poder consultar `media` por el
// id de una URL /media/{id} antes de que el handler síncrono por defecto
// convierta la imagen a hast.
const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkDirective)
  .use(remarkMediaImages)
  .use(remarkRehype, { handlers: directiveHandlers })
  .use(rehypeShiki, { theme: "github-dark" })
  .use(rehypeSanitize, schema)
  .use(rehypeStringify);

export async function renderMarkdown(markdown: string): Promise<string> {
  const file = await processor.process(markdown);
  return String(file);
}

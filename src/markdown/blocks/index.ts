import { registerBlock } from "./registry.js";
import { calloutBlock } from "./callout.js";
import { galleryBlock } from "./gallery.js";
import { youtubeBlock } from "./youtube.js";

// Único punto de entrada del motor de bloques: registra los tres bloques de
// esta slice (efecto de módulo, se ejecuta una vez por proceso) y expone la
// lista de sus nodos TipTap para src/markdown/tiptap/extensions.ts. Un
// bloque nuevo agrega su archivo y una línea acá — no toca pipeline.ts,
// toHast.ts ni fromMarkdown.ts/toMarkdown.ts (docs/slices/06.md §4).
registerBlock(calloutBlock);
registerBlock(galleryBlock);
registerBlock(youtubeBlock);

export const blockTiptapNodes = [calloutBlock.tiptapNode, galleryBlock.tiptapNode, youtubeBlock.tiptapNode];

import type { Image, Root } from "mdast";
import type { Plugin } from "unified";
import { inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { media } from "../db/schema.js";
import { buildResponsiveImage, parseMediaUrl } from "../modules/media/derivatives.js";

// `gallery.ts` (T7) arma su propio `<figure>` a mano y nunca pasa sus
// imágenes por el handler por defecto de mdast-util-to-hast, así que
// necesita las dimensiones resueltas por su cuenta, sin volver a consultar
// la base (docs/slices/07.md §0).
declare module "mdast" {
  interface Data {
    mediaImage?: { width: number; height: number };
  }
}

interface NodeWithChildren {
  children: unknown[];
}

function hasChildren(node: unknown): node is NodeWithChildren {
  return typeof node === "object" && node !== null && Array.isArray((node as { children?: unknown }).children);
}

function isImage(node: unknown): node is Image {
  return typeof node === "object" && node !== null && (node as { type?: unknown }).type === "image";
}

// Recorrida manual de ~10 líneas (sin sumar unist-util-visit como
// dependencia, docs/slices/07.md §0): entra también a los hijos de un
// containerDirective (callout, gallery) porque en esta etapa del pipeline
// la directiva todavía no se convirtió a hast, sus hijos son mdast común.
function collectImages(node: unknown, images: Image[]): void {
  if (isImage(node)) {
    images.push(node);
    return;
  }
  if (hasChildren(node)) {
    for (const child of node.children) {
      collectImages(child, images);
    }
  }
}

function groupById(images: Image[]): Map<string, Image[]> {
  const byId = new Map<string, Image[]>();
  for (const image of images) {
    const id = parseMediaUrl(image.url);
    if (!id) {
      continue;
    }
    const group = byId.get(id);
    if (group) {
      group.push(image);
    } else {
      byId.set(id, [image]);
    }
  }
  return byId;
}

// Enriquece las imágenes del cuerpo con srcset/width/height/loading antes de
// que remark-rehype las convierta (§0): el handler por defecto de una
// imagen es síncrono, no puede consultar `media`, así que la resolución
// pasa acá, mientras el árbol todavía es mdast.
const remarkMediaImages: Plugin<[], Root> = function remarkMediaImages() {
  return async (tree) => {
    const images: Image[] = [];
    collectImages(tree, images);

    const byId = groupById(images);
    if (byId.size === 0) {
      // Ningún /media/ referenciado: no toca la base, lo que mantiene
      // tests/unit/pipeline.test.ts corriendo sin Postgres.
      return;
    }

    const rows = await db
      .select({ id: media.id, width: media.width, height: media.height })
      .from(media)
      .where(inArray(media.id, [...byId.keys()]));

    for (const row of rows) {
      if (row.width === null || row.height === null) {
        continue;
      }
      const responsive = buildResponsiveImage({ id: row.id, width: row.width, height: row.height });
      for (const image of byId.get(row.id) ?? []) {
        image.data ??= {};
        image.data.hProperties = {
          ...image.data.hProperties,
          src: responsive.src,
          srcset: responsive.srcset,
          width: responsive.width,
          height: responsive.height,
          loading: "lazy",
        };
        image.data.mediaImage = { width: responsive.width, height: responsive.height };
      }
    }
    // Una URL que matchea pero cuya fila ya no existe (borrada) no aparece
    // en `rows`: la imagen queda como un `<img src alt>` liso, sin romper el
    // resto del post (docs/slices/07.md §0).
  };
};

export default remarkMediaImages;

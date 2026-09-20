import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { posts } from "../../db/schema.js";
import { renderMarkdown } from "../../markdown/pipeline.js";
import { findTranslationSibling } from "../content/posts.js";
import { translateContent } from "./openrouter.js";
import { directiveShapesMatch, extractDirectiveShape } from "./validate.js";

export class TranslationValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslationValidationError";
  }
}

interface SourcePostRow {
  id: string;
  spaceId: string;
  lang: "es" | "en";
  status: "draft" | "scheduled" | "published";
  translationGroupId: string;
  updatedAt: Date;
  title: string;
  excerpt: string | null;
  bodyMd: string;
}

async function loadSourcePost(id: string): Promise<SourcePostRow> {
  const [row] = await db
    .select({
      id: posts.id,
      spaceId: posts.spaceId,
      lang: posts.lang,
      status: posts.status,
      translationGroupId: posts.translationGroupId,
      updatedAt: posts.updatedAt,
      title: posts.title,
      excerpt: posts.excerpt,
      bodyMd: posts.bodyMd,
    })
    .from(posts)
    .where(eq(posts.id, id))
    .limit(1);

  if (!row) {
    throw new Error("Post no encontrado");
  }

  return row;
}

function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// El modelo propone el slug (§0); acá sólo se resuelve la colisión con un
// sufijo numérico, sin pantalla de confirmación intermedia — el autor lo
// ajusta después como cualquier otro campo del post.
async function resolveUniqueSlug(spaceId: string, lang: "es" | "en", proposedSlug: string): Promise<string> {
  const base = slugify(proposedSlug) || "post";
  let candidate = base;
  let suffix = 2;

  for (;;) {
    const [existing] = await db
      .select({ id: posts.id })
      .from(posts)
      .where(and(eq(posts.spaceId, spaceId), eq(posts.lang, lang), eq(posts.slug, candidate)))
      .limit(1);

    if (!existing) {
      return candidate;
    }

    candidate = `${base}-${suffix.toString()}`;
    suffix += 1;
  }
}

export async function translatePost(originalId: string): Promise<{ id: string }> {
  const original = await loadSourcePost(originalId);

  if (original.lang !== "es" || original.status !== "published") {
    throw new Error("Sólo se puede traducir un post publicado en español");
  }

  const translated = await translateContent({
    title: original.title,
    excerpt: original.excerpt,
    bodyMd: original.bodyMd,
  });

  const originalShape = extractDirectiveShape(original.bodyMd);
  const translatedShape = extractDirectiveShape(translated.bodyMd);

  if (!directiveShapesMatch(originalShape, translatedShape)) {
    throw new TranslationValidationError(
      "La traducción alteró la estructura de bloques del post original y fue rechazada",
    );
  }

  const bodyHtml = await renderMarkdown(translated.bodyMd);
  const now = new Date();
  const sibling = await findTranslationSibling(original.translationGroupId, original.id);

  if (sibling) {
    await db
      .update(posts)
      .set({
        title: translated.title,
        excerpt: translated.excerpt,
        bodyMd: translated.bodyMd,
        bodyHtml,
        translatedAt: now,
        sourceUpdatedAt: original.updatedAt,
        updatedAt: now,
      })
      .where(eq(posts.id, sibling.id));

    return { id: sibling.id };
  }

  const slug = await resolveUniqueSlug(original.spaceId, "en", translated.slug);

  const [row] = await db
    .insert(posts)
    .values({
      spaceId: original.spaceId,
      lang: "en",
      translationGroupId: original.translationGroupId,
      sourcePostId: original.id,
      translatedAt: now,
      sourceUpdatedAt: original.updatedAt,
      slug,
      title: translated.title,
      excerpt: translated.excerpt,
      bodyMd: translated.bodyMd,
      bodyHtml,
      status: "draft",
    })
    .returning({ id: posts.id });

  if (!row) {
    throw new Error("No se pudo crear la traducción");
  }

  return { id: row.id };
}

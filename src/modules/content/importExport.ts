import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { categories, postCategories, posts, spaces } from "../../db/schema.js";
import { renderMarkdown } from "../../markdown/pipeline.js";
import { syncPostTags } from "../taxonomy/tags.js";
import { parseFrontMatterFile, serializeFrontMatterFile } from "./frontmatter.js";
import { listAllPostsForExport } from "./posts.js";

type PostStatus = "draft" | "scheduled" | "published";

interface ParsedPostFile {
  slug: string;
  title: string;
  status: PostStatus;
  publishedAt: Date | null;
  excerpt: string | null;
  categorySlugs: string[];
  tagNames: string[];
  translationOf: string | null;
  bodyMd: string;
}

function splitList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function parsePostFile(raw: string, fileName: string): ParsedPostFile {
  const { data, bodyMd } = parseFrontMatterFile(raw);

  const title = data.title;
  const slug = data.slug;
  const status = data.status;

  if (!title || !slug) {
    throw new Error(`${fileName}: falta "title" o "slug" en el front-matter`);
  }
  if (status !== "draft" && status !== "scheduled" && status !== "published") {
    throw new Error(`${fileName}: status inválido "${status ?? ""}"`);
  }

  const publishedAt = data.published_at ? new Date(data.published_at) : null;
  if (status !== "draft" && !publishedAt) {
    throw new Error(`${fileName}: falta "published_at" para un post ${status}`);
  }
  if (publishedAt && Number.isNaN(publishedAt.getTime())) {
    throw new Error(`${fileName}: "published_at" inválido`);
  }

  return {
    slug,
    title,
    status,
    publishedAt,
    excerpt: data.excerpt ?? null,
    categorySlugs: splitList(data.categories),
    tagNames: splitList(data.tags),
    translationOf: data.translation_of ?? null,
    bodyMd,
  };
}

async function listMdFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir);
    return entries.filter((entry) => entry.endsWith(".md")).sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function resolveCategoryIds(spaceId: string, slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) {
    return [];
  }

  const rows = await db
    .select({ id: categories.id, slug: categories.slug })
    .from(categories)
    .where(eq(categories.spaceId, spaceId));
  const bySlug = new Map(rows.map((row) => [row.slug, row.id]));

  return slugs.map((slug) => {
    const id = bySlug.get(slug);
    if (!id) {
      throw new Error(`La categoría "${slug}" no existe en este espacio`);
    }
    return id;
  });
}

async function setPostCategories(postId: string, categoryIds: string[]): Promise<void> {
  await db.delete(postCategories).where(eq(postCategories.postId, postId));
  if (categoryIds.length === 0) {
    return;
  }
  await db.insert(postCategories).values(categoryIds.map((categoryId) => ({ postId, categoryId })));
}

interface TranslationRef {
  sourcePostId: string;
  translationGroupId: string;
}

interface UpsertResult {
  id: string;
  translationGroupId: string;
  created: boolean;
}

// Mismo criterio de upsert por (espacio, lang, slug) para archivo nuevo o ya
// importado antes (docs/slices/10.md §0): una reimportación después de
// vaciar la base y una carga incremental usan el mismo camino.
async function upsertPostFile(
  spaceId: string,
  lang: "es" | "en",
  file: ParsedPostFile,
  translationOf: TranslationRef | null,
): Promise<UpsertResult> {
  const bodyHtml = await renderMarkdown(file.bodyMd);
  const categoryIds = await resolveCategoryIds(spaceId, file.categorySlugs);

  const [existing] = await db
    .select({ id: posts.id, translationGroupId: posts.translationGroupId })
    .from(posts)
    .where(and(eq(posts.spaceId, spaceId), eq(posts.lang, lang), eq(posts.slug, file.slug)))
    .limit(1);

  let postId: string;
  let translationGroupId: string;
  let created: boolean;

  if (existing) {
    translationGroupId = translationOf ? translationOf.translationGroupId : existing.translationGroupId;

    await db
      .update(posts)
      .set({
        title: file.title,
        excerpt: file.excerpt,
        bodyMd: file.bodyMd,
        bodyHtml,
        status: file.status,
        publishedAt: file.publishedAt,
        sourcePostId: translationOf ? translationOf.sourcePostId : null,
        translationGroupId,
        updatedAt: new Date(),
      })
      .where(eq(posts.id, existing.id));

    postId = existing.id;
    created = false;
  } else {
    const [row] = await db
      .insert(posts)
      .values({
        spaceId,
        lang,
        slug: file.slug,
        title: file.title,
        excerpt: file.excerpt,
        bodyMd: file.bodyMd,
        bodyHtml,
        status: file.status,
        publishedAt: file.publishedAt,
        ...(translationOf
          ? { sourcePostId: translationOf.sourcePostId, translationGroupId: translationOf.translationGroupId }
          : {}),
      })
      .returning({ id: posts.id, translationGroupId: posts.translationGroupId });

    if (!row) {
      throw new Error(`No se pudo crear el post importado "${file.slug}"`);
    }

    postId = row.id;
    translationGroupId = row.translationGroupId;
    created = true;
  }

  await setPostCategories(postId, categoryIds);
  await syncPostTags(postId, file.tagNames);

  return { id: postId, translationGroupId, created };
}

async function findSpaceIdBySlug(spaceSlug: string): Promise<string> {
  const [space] = await db.select({ id: spaces.id }).from(spaces).where(eq(spaces.slug, spaceSlug)).limit(1);
  if (!space) {
    throw new Error(`No existe el espacio "${spaceSlug}"`);
  }
  return space.id;
}

export interface ImportSummary {
  created: number;
  updated: number;
}

// Lee es/ y recién después en/ (docs/slices/10.md §0): translation_of de un
// archivo de en/ se resuelve contra los slugs de es/ ya importados en esta
// misma corrida, no contra la base entera.
export async function importSpaceFromDirectory(spaceSlug: string, dir: string): Promise<ImportSummary> {
  const spaceId = await findSpaceIdBySlug(spaceSlug);

  let created = 0;
  let updated = 0;
  const esSlugToPost = new Map<string, { id: string; translationGroupId: string }>();

  const esDir = path.join(dir, "es");
  for (const fileName of await listMdFiles(esDir)) {
    const raw = await readFile(path.join(esDir, fileName), "utf8");
    const parsed = parsePostFile(raw, fileName);
    const result = await upsertPostFile(spaceId, "es", parsed, null);
    esSlugToPost.set(parsed.slug, { id: result.id, translationGroupId: result.translationGroupId });
    if (result.created) {
      created++;
    } else {
      updated++;
    }
  }

  const enDir = path.join(dir, "en");
  for (const fileName of await listMdFiles(enDir)) {
    const raw = await readFile(path.join(enDir, fileName), "utf8");
    const parsed = parsePostFile(raw, fileName);
    const source = parsed.translationOf ? (esSlugToPost.get(parsed.translationOf) ?? null) : null;
    const translationOf: TranslationRef | null = source
      ? { sourcePostId: source.id, translationGroupId: source.translationGroupId }
      : null;

    const result = await upsertPostFile(spaceId, "en", parsed, translationOf);
    if (result.created) {
      created++;
    } else {
      updated++;
    }
  }

  return { created, updated };
}

export interface ExportSummary {
  exported: number;
}

// Un archivo por post en {dir}/{lang}/{slug}.md (docs/slices/10.md §0):
// completo, incluye borradores y programados, no sólo publicados.
export async function exportSpaceToDirectory(spaceSlug: string, dir: string): Promise<ExportSummary> {
  const spaceId = await findSpaceIdBySlug(spaceSlug);

  let exported = 0;

  for (const lang of ["es", "en"] as const) {
    const items = await listAllPostsForExport(spaceId, lang);
    if (items.length === 0) {
      continue;
    }

    const langDir = path.join(dir, lang);
    await mkdir(langDir, { recursive: true });

    for (const item of items) {
      const content = serializeFrontMatterFile(
        {
          title: item.title,
          slug: item.slug,
          status: item.status,
          published_at: item.publishedAt ? item.publishedAt.toISOString() : undefined,
          excerpt: item.excerpt ?? undefined,
          categories: item.categorySlugs.length > 0 ? item.categorySlugs.join(", ") : undefined,
          tags: item.tagNames.length > 0 ? item.tagNames.join(", ") : undefined,
          translation_of: lang === "en" ? (item.translationOfSlug ?? undefined) : undefined,
        },
        item.bodyMd,
      );

      await writeFile(path.join(langDir, `${item.slug}.md`), content, "utf8");
      exported++;
    }
  }

  return { exported };
}

import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { categories, postCategories, posts, postSlugs, spaces } from "../../db/schema.js";
import { renderMarkdown } from "../../markdown/pipeline.js";

const LIST_LIMIT = 200;
const PAGE_SIZE = 10;

export interface PostSummary {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "scheduled" | "published";
  spaceName: string;
  updatedAt: Date;
}

export interface PostDetail {
  id: string;
  spaceId: string;
  slug: string;
  title: string;
  excerpt: string | null;
  bodyMd: string;
  status: "draft" | "scheduled" | "published";
  categoryIds: string[];
}

export interface PostInput {
  spaceId: string;
  slug: string;
  title: string;
  excerpt: string | null;
  bodyMd: string;
  categoryIds: string[];
}

// Sólo asocia categorías del mismo espacio que el post (invariante 2): una
// categoría tildada que pertenece a otro espacio se descarta en silencio en
// vez de romper el guardado, porque el formulario de post no filtra las
// categorías por espacio antes de enviarlas (docs/slices/03.md §0).
async function syncPostCategories(postId: string, spaceId: string, categoryIds: string[]): Promise<void> {
  await db.delete(postCategories).where(eq(postCategories.postId, postId));

  if (categoryIds.length === 0) {
    return;
  }

  const validCategories = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.spaceId, spaceId), inArray(categories.id, categoryIds)));

  if (validCategories.length === 0) {
    return;
  }

  await db.insert(postCategories).values(validCategories.map((category) => ({ postId, categoryId: category.id })));
}

export async function listPosts(): Promise<PostSummary[]> {
  return db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      status: posts.status,
      spaceName: spaces.name,
      updatedAt: posts.updatedAt,
    })
    .from(posts)
    .innerJoin(spaces, eq(posts.spaceId, spaces.id))
    .orderBy(desc(posts.updatedAt))
    .limit(LIST_LIMIT);
}

export async function getPost(id: string): Promise<PostDetail | null> {
  const [row] = await db
    .select({
      id: posts.id,
      spaceId: posts.spaceId,
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      bodyMd: posts.bodyMd,
      status: posts.status,
    })
    .from(posts)
    .where(eq(posts.id, id))
    .limit(1);

  if (!row) {
    return null;
  }

  const categoryRows = await db
    .select({ categoryId: postCategories.categoryId })
    .from(postCategories)
    .where(eq(postCategories.postId, id));

  return { ...row, categoryIds: categoryRows.map((categoryRow) => categoryRow.categoryId) };
}

export async function createPost(input: PostInput): Promise<{ id: string }> {
  const bodyHtml = await renderMarkdown(input.bodyMd);

  const [row] = await db
    .insert(posts)
    .values({
      spaceId: input.spaceId,
      slug: input.slug,
      title: input.title,
      excerpt: input.excerpt,
      bodyMd: input.bodyMd,
      bodyHtml,
    })
    .returning({ id: posts.id });

  if (!row) {
    throw new Error("No se pudo crear el post");
  }

  await syncPostCategories(row.id, input.spaceId, input.categoryIds);

  return row;
}

export async function updatePost(id: string, input: PostInput): Promise<void> {
  const [current] = await db
    .select({ slug: posts.slug, spaceId: posts.spaceId, lang: posts.lang, status: posts.status })
    .from(posts)
    .where(eq(posts.id, id))
    .limit(1);

  if (!current) {
    throw new Error("Post no encontrado");
  }

  if (input.slug !== current.slug && current.status === "published") {
    await db.insert(postSlugs).values({
      postId: id,
      spaceId: current.spaceId,
      lang: current.lang,
      slug: current.slug,
    });
  }

  const bodyHtml = await renderMarkdown(input.bodyMd);

  await db
    .update(posts)
    .set({
      spaceId: input.spaceId,
      slug: input.slug,
      title: input.title,
      excerpt: input.excerpt,
      bodyMd: input.bodyMd,
      bodyHtml,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, id));

  await syncPostCategories(id, input.spaceId, input.categoryIds);
}

export async function publishPost(id: string): Promise<void> {
  await db
    .update(posts)
    .set({ status: "published", publishedAt: new Date() })
    .where(eq(posts.id, id));
}

export async function deletePost(id: string): Promise<void> {
  await db.delete(posts).where(eq(posts.id, id));
}

export async function findPublishedPost(
  spaceId: string,
  lang: "es" | "en",
  slug: string,
): Promise<{ title: string; bodyHtml: string } | null> {
  const [row] = await db
    .select({ title: posts.title, bodyHtml: posts.bodyHtml })
    .from(posts)
    .where(
      and(eq(posts.spaceId, spaceId), eq(posts.lang, lang), eq(posts.slug, slug), eq(posts.status, "published")),
    )
    .limit(1);

  return row ?? null;
}

export interface PostListItem {
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: Date;
}

export interface PostPage {
  items: PostListItem[];
  hasNext: boolean;
}

interface PublishedPostRow {
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: Date | null;
}

// Recibe PAGE_SIZE + 1 filas (así se sabe si hay página siguiente sin un
// segundo COUNT(*), docs/slices/03.md §0) y descarta la de más.
function toPostPage(rows: PublishedPostRow[]): PostPage {
  const hasNext = rows.length > PAGE_SIZE;
  const items = rows.slice(0, PAGE_SIZE).map((row) => {
    if (!row.publishedAt) {
      // publishPost() fija status y published_at juntos: un post "published"
      // sin fecha es un estado imposible, no un caso a tolerar en silencio.
      throw new Error(`Post publicado sin published_at: ${row.slug}`);
    }
    return { slug: row.slug, title: row.title, excerpt: row.excerpt, publishedAt: row.publishedAt };
  });

  return { items, hasNext };
}

export async function listPublishedPosts(
  spaceId: string,
  lang: "es" | "en",
  page: number,
): Promise<PostPage> {
  const rows = await db
    .select({
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      publishedAt: posts.publishedAt,
    })
    .from(posts)
    .where(and(eq(posts.spaceId, spaceId), eq(posts.lang, lang), eq(posts.status, "published")))
    // desempate por id: dos posts publicados en el mismo instante no deben
    // quedar en orden no determinista entre la página 1 y la página 2.
    .orderBy(desc(posts.publishedAt), asc(posts.id))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);

  return toPostPage(rows);
}

export async function listPublishedPostsByCategory(
  spaceId: string,
  lang: "es" | "en",
  categorySlug: string,
  page: number,
): Promise<PostPage | null> {
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.spaceId, spaceId), eq(categories.slug, categorySlug)))
    .limit(1);

  if (!category) {
    return null;
  }

  const rows = await db
    .select({
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      publishedAt: posts.publishedAt,
    })
    .from(posts)
    .innerJoin(postCategories, eq(postCategories.postId, posts.id))
    .where(
      and(
        eq(posts.spaceId, spaceId),
        eq(posts.lang, lang),
        eq(posts.status, "published"),
        eq(postCategories.categoryId, category.id),
      ),
    )
    .orderBy(desc(posts.publishedAt), asc(posts.id))
    .limit(PAGE_SIZE + 1)
    .offset((page - 1) * PAGE_SIZE);

  return toPostPage(rows);
}

export async function findCurrentSlugForRedirect(
  spaceId: string,
  lang: "es" | "en",
  oldSlug: string,
): Promise<string | null> {
  const [row] = await db
    .select({ currentSlug: posts.slug })
    .from(postSlugs)
    .innerJoin(posts, eq(postSlugs.postId, posts.id))
    .where(
      and(
        eq(postSlugs.spaceId, spaceId),
        eq(postSlugs.lang, lang),
        eq(postSlugs.slug, oldSlug),
        eq(posts.status, "published"),
      ),
    )
    .limit(1);

  return row?.currentSlug ?? null;
}

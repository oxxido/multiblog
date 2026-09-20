import { and, asc, count, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { db } from "../../db/client.js";
import { categories, postCategories, posts, postSlugs, postTags, spaces, tags } from "../../db/schema.js";
import { renderMarkdown } from "../../markdown/pipeline.js";

const LIST_LIMIT = 200;
export const PAGE_SIZE = 10;

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
  coverMediaId: string | null;
}

export interface PostInput {
  spaceId: string;
  slug: string;
  title: string;
  excerpt: string | null;
  bodyMd: string;
  categoryIds: string[];
  coverMediaId: string | null;
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
      coverMediaId: posts.coverMediaId,
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
      coverMediaId: input.coverMediaId,
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
      coverMediaId: input.coverMediaId,
      updatedAt: new Date(),
    })
    .where(eq(posts.id, id));

  await syncPostCategories(id, input.spaceId, input.categoryIds);
}

// Mismo alcance que ya tenía el botón "Guardar" de S2/S3 sobre el cuerpo
// (también reescribe body_html sin mirar status): el autosave lo hace
// automático, no le suma un riesgo nuevo. Nunca toca slug, title, status ni
// categorías (docs/slices/05.md §0).
export async function autosavePostBody(id: string, bodyMd: string): Promise<void> {
  const bodyHtml = await renderMarkdown(bodyMd);
  await db.update(posts).set({ bodyMd, bodyHtml, updatedAt: new Date() }).where(eq(posts.id, id));
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

const WORDS_PER_MINUTE = 200;

// Palabras / 200, redondeado hacia arriba, mínimo 1 (docs/slices/04.md §0):
// no se guarda en la base, se deriva de body_md en cada lectura.
function computeReadingMinutes(bodyMd: string): number {
  const words = bodyMd.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

export interface PostCategoryRef {
  slug: string;
  name: string;
}

export interface PostTagRef {
  slug: string;
  name: string;
}

export interface AdjacentPostRef {
  slug: string;
  title: string;
}

export interface PublishedPostView {
  title: string;
  excerpt: string | null;
  bodyHtml: string;
  publishedAt: Date;
  readingMinutes: number;
  // Un post puede tener varias categorías (N a N); se muestra la primera
  // que devuelva la consulta, sin concepto de "categoría principal"
  // (docs/slices/04.md §0).
  category: PostCategoryRef | null;
  tags: PostTagRef[];
  prev: AdjacentPostRef | null;
  next: AdjacentPostRef | null;
  coverMediaId: string | null;
}

export async function findPublishedPost(
  spaceId: string,
  lang: "es" | "en",
  slug: string,
): Promise<PublishedPostView | null> {
  const [row] = await db
    .select({
      id: posts.id,
      title: posts.title,
      excerpt: posts.excerpt,
      bodyMd: posts.bodyMd,
      bodyHtml: posts.bodyHtml,
      publishedAt: posts.publishedAt,
      coverMediaId: posts.coverMediaId,
    })
    .from(posts)
    .where(
      and(eq(posts.spaceId, spaceId), eq(posts.lang, lang), eq(posts.slug, slug), eq(posts.status, "published")),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  if (!row.publishedAt) {
    // Igual que en toPostPage: publishPost() fija status y published_at
    // juntos, así que este estado es imposible, no un caso a tolerar.
    throw new Error(`Post publicado sin published_at: ${slug}`);
  }

  const [categoryRow] = await db
    .select({ slug: categories.slug, name: categories.name })
    .from(postCategories)
    .innerJoin(categories, eq(postCategories.categoryId, categories.id))
    .where(eq(postCategories.postId, row.id))
    .limit(1);

  const tagRows = await db
    .select({ slug: tags.slug, name: tags.name })
    .from(postTags)
    .innerJoin(tags, eq(postTags.tagId, tags.id))
    .where(eq(postTags.postId, row.id))
    .limit(LIST_LIMIT);

  const [prevRow] = await db
    .select({ slug: posts.slug, title: posts.title })
    .from(posts)
    .where(
      and(
        eq(posts.spaceId, spaceId),
        eq(posts.lang, lang),
        eq(posts.status, "published"),
        lt(posts.publishedAt, row.publishedAt),
      ),
    )
    .orderBy(desc(posts.publishedAt))
    .limit(1);

  const [nextRow] = await db
    .select({ slug: posts.slug, title: posts.title })
    .from(posts)
    .where(
      and(
        eq(posts.spaceId, spaceId),
        eq(posts.lang, lang),
        eq(posts.status, "published"),
        gt(posts.publishedAt, row.publishedAt),
      ),
    )
    .orderBy(asc(posts.publishedAt))
    .limit(1);

  return {
    title: row.title,
    excerpt: row.excerpt,
    bodyHtml: row.bodyHtml,
    publishedAt: row.publishedAt,
    readingMinutes: computeReadingMinutes(row.bodyMd),
    category: categoryRow ?? null,
    tags: tagRows,
    prev: prevRow ?? null,
    next: nextRow ?? null,
    coverMediaId: row.coverMediaId,
  };
}

export interface PostListItem {
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: Date;
  readingMinutes: number;
  category: PostCategoryRef | null;
}

export interface PostPage {
  items: PostListItem[];
  hasNext: boolean;
}

interface PublishedPostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  bodyMd: string;
  publishedAt: Date | null;
}

// La categoría es N a N (post_categories); para no pagar un lookup por fila
// se trae en un solo IN() y se queda con la primera que aparezca por post,
// mismo criterio "sin orden declarado" que findPublishedPost (docs/slices/04.md §0).
async function firstCategoriesByPostId(postIds: string[]): Promise<Map<string, PostCategoryRef>> {
  if (postIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({ postId: postCategories.postId, slug: categories.slug, name: categories.name })
    .from(postCategories)
    .innerJoin(categories, eq(postCategories.categoryId, categories.id))
    .where(inArray(postCategories.postId, postIds));

  const byPostId = new Map<string, PostCategoryRef>();
  for (const row of rows) {
    if (!byPostId.has(row.postId)) {
      byPostId.set(row.postId, { slug: row.slug, name: row.name });
    }
  }
  return byPostId;
}

// Recibe PAGE_SIZE + 1 filas (así se sabe si hay página siguiente sin un
// segundo COUNT(*), docs/slices/03.md §0) y descarta la de más.
async function toPostPage(rows: PublishedPostRow[]): Promise<PostPage> {
  const hasNext = rows.length > PAGE_SIZE;
  const pageRows = rows.slice(0, PAGE_SIZE);
  const categoryByPostId = await firstCategoriesByPostId(pageRows.map((row) => row.id));

  const items = pageRows.map((row) => {
    if (!row.publishedAt) {
      // publishPost() fija status y published_at juntos: un post "published"
      // sin fecha es un estado imposible, no un caso a tolerar en silencio.
      throw new Error(`Post publicado sin published_at: ${row.slug}`);
    }
    return {
      slug: row.slug,
      title: row.title,
      excerpt: row.excerpt,
      publishedAt: row.publishedAt,
      readingMinutes: computeReadingMinutes(row.bodyMd),
      category: categoryByPostId.get(row.id) ?? null,
    };
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
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      bodyMd: posts.bodyMd,
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
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      bodyMd: posts.bodyMd,
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

export async function countPublishedPosts(spaceId: string, lang: "es" | "en"): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(posts)
    .where(and(eq(posts.spaceId, spaceId), eq(posts.lang, lang), eq(posts.status, "published")));

  return row?.value ?? 0;
}

export async function countPublishedPostsByCategory(
  spaceId: string,
  lang: "es" | "en",
  categorySlug: string,
): Promise<number | null> {
  const [category] = await db
    .select({ id: categories.id })
    .from(categories)
    .where(and(eq(categories.spaceId, spaceId), eq(categories.slug, categorySlug)))
    .limit(1);

  if (!category) {
    return null;
  }

  const [row] = await db
    .select({ value: count() })
    .from(posts)
    .innerJoin(postCategories, eq(postCategories.postId, posts.id))
    .where(
      and(
        eq(posts.spaceId, spaceId),
        eq(posts.lang, lang),
        eq(posts.status, "published"),
        eq(postCategories.categoryId, category.id),
      ),
    );

  return row?.value ?? 0;
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

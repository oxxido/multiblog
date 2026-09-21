import { alias } from "drizzle-orm/pg-core";
import { and, asc, count, desc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { categories, postCategories, posts, postSlugs, postTags, spaces, tags } from "../../db/schema.js";
import { renderMarkdown } from "../../markdown/pipeline.js";
import { syncPostTags, tagNamesForPost } from "../taxonomy/tags.js";

const LIST_LIMIT = 200;
export const PAGE_SIZE = 10;

export interface PostSummary {
  id: string;
  slug: string;
  title: string;
  status: "draft" | "scheduled" | "published";
  publishedAt: Date | null;
  spaceName: string;
  updatedAt: Date;
  lang: "es" | "en";
  // Verdadero cuando el original de esta traducción se editó después de la
  // última corrida del traductor (docs/slices/08.md T6): "editar el original
  // en silencio no desactualiza en silencio la traducción".
  isStale: boolean;
}

export interface PostDetail {
  id: string;
  spaceId: string;
  slug: string;
  title: string;
  excerpt: string | null;
  bodyMd: string;
  status: "draft" | "scheduled" | "published";
  publishedAt: Date | null;
  categoryIds: string[];
  tagNames: string[];
  coverMediaId: string | null;
  lang: "es" | "en";
  translationGroupId: string;
  sourcePostId: string | null;
  sourceUpdatedAt: Date | null;
  updatedAt: Date;
  previewToken: string;
}

export interface PostInput {
  spaceId: string;
  slug: string;
  title: string;
  excerpt: string | null;
  bodyMd: string;
  categoryIds: string[];
  tagNames: string[];
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
  const sourcePost = alias(posts, "source_post");

  const rows = await db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      status: posts.status,
      publishedAt: posts.publishedAt,
      spaceName: spaces.name,
      updatedAt: posts.updatedAt,
      lang: posts.lang,
      translatedAt: posts.translatedAt,
      sourceUpdatedAt: sourcePost.updatedAt,
    })
    .from(posts)
    .innerJoin(spaces, eq(posts.spaceId, spaces.id))
    .leftJoin(sourcePost, eq(posts.sourcePostId, sourcePost.id))
    .orderBy(desc(posts.updatedAt))
    .limit(LIST_LIMIT);

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    publishedAt: row.publishedAt,
    spaceName: row.spaceName,
    updatedAt: row.updatedAt,
    lang: row.lang,
    isStale: row.translatedAt !== null && row.sourceUpdatedAt !== null && row.sourceUpdatedAt > row.translatedAt,
  }));
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
      publishedAt: posts.publishedAt,
      coverMediaId: posts.coverMediaId,
      lang: posts.lang,
      translationGroupId: posts.translationGroupId,
      sourcePostId: posts.sourcePostId,
      sourceUpdatedAt: posts.sourceUpdatedAt,
      updatedAt: posts.updatedAt,
      previewToken: posts.previewToken,
    })
    .from(posts)
    .where(eq(posts.id, id))
    .limit(1);

  if (!row) {
    return null;
  }

  const [categoryRows, tagNames] = await Promise.all([
    db.select({ categoryId: postCategories.categoryId }).from(postCategories).where(eq(postCategories.postId, id)),
    tagNamesForPost(id),
  ]);

  return {
    ...row,
    categoryIds: categoryRows.map((categoryRow) => categoryRow.categoryId),
    tagNames,
  };
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
  await syncPostTags(row.id, input.tagNames);

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
  await syncPostTags(id, input.tagNames);
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

// "Publicar ya" (publishPost) y "programar" son acciones separadas
// (docs/slices/10.md §0): programar deja status = "scheduled" y es
// publishDuePosts (scheduler.ts), no este módulo, quien lo pasa a
// "published" cuando llega la fecha.
export async function schedulePost(id: string, publishAt: Date): Promise<void> {
  await db.update(posts).set({ status: "scheduled", publishedAt: publishAt }).where(eq(posts.id, id));
}

export async function cancelSchedule(id: string): Promise<void> {
  await db.update(posts).set({ status: "draft", publishedAt: null }).where(eq(posts.id, id));
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
  id: string;
  translationGroupId: string;
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
      translationGroupId: posts.translationGroupId,
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
    id: row.id,
    translationGroupId: row.translationGroupId,
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

export interface PreviewPostView {
  id: string;
  translationGroupId: string;
  lang: "es" | "en";
  status: "draft" | "scheduled" | "published";
  title: string;
  excerpt: string | null;
  bodyHtml: string;
  publishedAt: Date | null;
  readingMinutes: number;
  category: PostCategoryRef | null;
  tags: PostTagRef[];
  coverMediaId: string | null;
}

// Vista previa de un borrador (o de un post programado) por token, sin
// filtrar por lang (el token ya identifica un post concreto con su propio
// idioma, docs/slices/10.md §0). Filtra por spaceId además del token
// (invariante 2), no porque el UUID sea adivinable.
export async function findPostByPreviewToken(spaceId: string, token: string): Promise<PreviewPostView | null> {
  const [row] = await db
    .select({
      id: posts.id,
      translationGroupId: posts.translationGroupId,
      lang: posts.lang,
      status: posts.status,
      title: posts.title,
      excerpt: posts.excerpt,
      bodyMd: posts.bodyMd,
      bodyHtml: posts.bodyHtml,
      publishedAt: posts.publishedAt,
      coverMediaId: posts.coverMediaId,
    })
    .from(posts)
    .where(and(eq(posts.spaceId, spaceId), eq(posts.previewToken, token)))
    .limit(1);

  if (!row) {
    return null;
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

  return {
    id: row.id,
    translationGroupId: row.translationGroupId,
    lang: row.lang,
    status: row.status,
    title: row.title,
    excerpt: row.excerpt,
    bodyHtml: row.bodyHtml,
    publishedAt: row.publishedAt,
    readingMinutes: computeReadingMinutes(row.bodyMd),
    category: categoryRow ?? null,
    tags: tagRows,
    coverMediaId: row.coverMediaId,
  };
}

// La única forma de invalidar un link de vista previa viejo (docs/slices/10.md
// §0): sin expiración automática.
export async function rotatePreviewToken(id: string): Promise<string> {
  const [row] = await db
    .update(posts)
    .set({ previewToken: sql`gen_random_uuid()` })
    .where(eq(posts.id, id))
    .returning({ previewToken: posts.previewToken });

  if (!row) {
    throw new Error("Post no encontrado");
  }

  return row.previewToken;
}

export interface PublishedTranslationSibling {
  lang: "es" | "en";
  slug: string;
}

// El hermano publicado del otro idioma dentro del mismo grupo, para armar
// hreflang/canonical/x-default en el sitio público (docs/slices/08.md T8).
// A diferencia de findTranslationSibling (admin), acá sólo interesa un
// hermano que ya sea visible al público.
export async function findPublishedTranslationSibling(
  translationGroupId: string,
  excludeId: string,
): Promise<PublishedTranslationSibling | null> {
  const [row] = await db
    .select({ lang: posts.lang, slug: posts.slug })
    .from(posts)
    .where(
      and(eq(posts.translationGroupId, translationGroupId), ne(posts.id, excludeId), eq(posts.status, "published")),
    )
    .limit(1);

  return row ?? null;
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

export interface TranslationSibling {
  id: string;
  slug: string;
  status: "draft" | "scheduled" | "published";
  lang: "es" | "en";
  translatedAt: Date | null;
}

// El grupo de traducción sólo tiene es/en (docs/I18N.md §1): el hermano de
// un post es, sencillamente, la otra fila del mismo grupo.
export async function findTranslationSibling(
  translationGroupId: string,
  excludeId: string,
): Promise<TranslationSibling | null> {
  const [row] = await db
    .select({ id: posts.id, slug: posts.slug, status: posts.status, lang: posts.lang, translatedAt: posts.translatedAt })
    .from(posts)
    .where(and(eq(posts.translationGroupId, translationGroupId), ne(posts.id, excludeId)))
    .limit(1);

  return row ?? null;
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

export interface FeedPostItem {
  slug: string;
  title: string;
  excerpt: string | null;
  bodyHtml: string;
  publishedAt: Date;
}

// Sin paginar (docs/slices/09.md T5): un límite fijo, mismo criterio que el
// resto de los listados de este módulo.
const FEED_POST_LIMIT = 50;

export async function listPublishedPostsForFeed(spaceId: string, lang: "es" | "en"): Promise<FeedPostItem[]> {
  const rows = await db
    .select({
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      bodyHtml: posts.bodyHtml,
      publishedAt: posts.publishedAt,
    })
    .from(posts)
    .where(and(eq(posts.spaceId, spaceId), eq(posts.lang, lang), eq(posts.status, "published")))
    .orderBy(desc(posts.publishedAt), asc(posts.id))
    .limit(FEED_POST_LIMIT);

  return rows.map((row) => {
    if (!row.publishedAt) {
      throw new Error(`Post publicado sin published_at: ${row.slug}`);
    }
    return { ...row, publishedAt: row.publishedAt };
  });
}

export interface SitemapPostRef {
  slug: string;
  updatedAt: Date;
}

const SITEMAP_POST_LIMIT = 1000;

export async function listPublishedSlugsForSitemap(spaceId: string, lang: "es" | "en"): Promise<SitemapPostRef[]> {
  return db
    .select({ slug: posts.slug, updatedAt: posts.updatedAt })
    .from(posts)
    .where(and(eq(posts.spaceId, spaceId), eq(posts.lang, lang), eq(posts.status, "published")))
    .orderBy(desc(posts.publishedAt), asc(posts.id))
    .limit(SITEMAP_POST_LIMIT);
}

export interface PostExportItem {
  slug: string;
  title: string;
  excerpt: string | null;
  status: "draft" | "scheduled" | "published";
  publishedAt: Date | null;
  bodyMd: string;
  categorySlugs: string[];
  tagNames: string[];
  translationOfSlug: string | null;
}

// Sin filtro de status, a diferencia de todo el resto del módulo (que sólo
// expone publicado): es la herramienta de respaldo/portabilidad completa
// (docs/slices/10.md §0), incluye borradores y programados.
const EXPORT_POST_LIMIT = 2000;

async function categorySlugsByPostId(postIds: string[]): Promise<Map<string, string[]>> {
  if (postIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({ postId: postCategories.postId, slug: categories.slug })
    .from(postCategories)
    .innerJoin(categories, eq(postCategories.categoryId, categories.id))
    .where(inArray(postCategories.postId, postIds));

  const byPostId = new Map<string, string[]>();
  for (const row of rows) {
    const list = byPostId.get(row.postId) ?? [];
    list.push(row.slug);
    byPostId.set(row.postId, list);
  }
  return byPostId;
}

async function tagNamesByPostId(postIds: string[]): Promise<Map<string, string[]>> {
  if (postIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({ postId: postTags.postId, name: tags.name })
    .from(postTags)
    .innerJoin(tags, eq(postTags.tagId, tags.id))
    .where(inArray(postTags.postId, postIds));

  const byPostId = new Map<string, string[]>();
  for (const row of rows) {
    const list = byPostId.get(row.postId) ?? [];
    list.push(row.name);
    byPostId.set(row.postId, list);
  }
  return byPostId;
}

export async function listAllPostsForExport(spaceId: string, lang: "es" | "en"): Promise<PostExportItem[]> {
  const rows = await db
    .select({
      id: posts.id,
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      status: posts.status,
      publishedAt: posts.publishedAt,
      bodyMd: posts.bodyMd,
      sourcePostId: posts.sourcePostId,
    })
    .from(posts)
    .where(and(eq(posts.spaceId, spaceId), eq(posts.lang, lang)))
    .limit(EXPORT_POST_LIMIT);

  const postIds = rows.map((row) => row.id);
  const [categoryMap, tagMap] = await Promise.all([categorySlugsByPostId(postIds), tagNamesByPostId(postIds)]);

  const sourceIds = rows.map((row) => row.sourcePostId).filter((id): id is string => id !== null);
  const sourceSlugById = new Map<string, string>();
  if (sourceIds.length > 0) {
    const sourceRows = await db.select({ id: posts.id, slug: posts.slug }).from(posts).where(inArray(posts.id, sourceIds));
    for (const row of sourceRows) {
      sourceSlugById.set(row.id, row.slug);
    }
  }

  return rows.map((row) => ({
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    status: row.status,
    publishedAt: row.publishedAt,
    bodyMd: row.bodyMd,
    categorySlugs: categoryMap.get(row.id) ?? [],
    tagNames: tagMap.get(row.id) ?? [],
    translationOfSlug: row.sourcePostId ? (sourceSlugById.get(row.sourcePostId) ?? null) : null,
  }));
}

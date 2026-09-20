import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { posts, postTags, spaces, tags } from "../../db/schema.js";

export interface CrossSpaceLatestItem {
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: Date;
  spaceSubdomain: string;
  spaceAccentColor: string | null;
}

interface LatestRow {
  slug: string;
  title: string;
  excerpt: string | null;
  publishedAt: Date | null;
  spaceSubdomain: string;
  spaceAccentColor: string | null;
}

function toLatestItems(rows: LatestRow[]): CrossSpaceLatestItem[] {
  return rows.map((row) => {
    if (!row.publishedAt) {
      // publishPost() fija status y published_at juntos: un post "published"
      // sin fecha es un estado imposible, no un caso a tolerar en silencio.
      throw new Error(`Post publicado sin published_at: ${row.slug}`);
    }
    return { ...row, publishedAt: row.publishedAt };
  });
}

export async function listLatestAcrossSpaces(lang: "es" | "en", limit: number): Promise<CrossSpaceLatestItem[]> {
  const rows: LatestRow[] = await db
    .select({
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      publishedAt: posts.publishedAt,
      spaceSubdomain: spaces.subdomain,
      spaceAccentColor: spaces.accentColor,
    })
    .from(posts)
    .innerJoin(spaces, eq(posts.spaceId, spaces.id))
    .where(and(eq(posts.lang, lang), eq(posts.status, "published"), isNull(spaces.archivedAt)))
    .orderBy(desc(posts.publishedAt), asc(posts.id))
    .limit(limit);

  return toLatestItems(rows);
}

export interface FeedCrossSpaceItem extends CrossSpaceLatestItem {
  bodyHtml: string;
}

// Sin paginar (docs/slices/09.md T5): un límite fijo, mismo criterio que el
// resto de los listados de este módulo.
const FEED_LATEST_LIMIT = 50;

export async function listLatestAcrossSpacesForFeed(lang: "es" | "en"): Promise<FeedCrossSpaceItem[]> {
  const rows = await db
    .select({
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      bodyHtml: posts.bodyHtml,
      publishedAt: posts.publishedAt,
      spaceSubdomain: spaces.subdomain,
      spaceAccentColor: spaces.accentColor,
    })
    .from(posts)
    .innerJoin(spaces, eq(posts.spaceId, spaces.id))
    .where(and(eq(posts.lang, lang), eq(posts.status, "published"), isNull(spaces.archivedAt)))
    .orderBy(desc(posts.publishedAt), asc(posts.id))
    .limit(FEED_LATEST_LIMIT);

  return rows.map((row) => {
    if (!row.publishedAt) {
      throw new Error(`Post publicado sin published_at: ${row.slug}`);
    }
    return { ...row, publishedAt: row.publishedAt };
  });
}

export interface CrossSpaceTag {
  slug: string;
  name: string;
  count: number;
}

export async function listTagsAcrossSpaces(lang: "es" | "en", limit: number): Promise<CrossSpaceTag[]> {
  return db
    .select({ slug: tags.slug, name: tags.name, count: count(postTags.postId) })
    .from(tags)
    .innerJoin(postTags, eq(postTags.tagId, tags.id))
    .innerJoin(posts, eq(postTags.postId, posts.id))
    .innerJoin(spaces, eq(posts.spaceId, spaces.id))
    .where(and(eq(posts.lang, lang), eq(posts.status, "published"), isNull(spaces.archivedAt)))
    .groupBy(tags.id)
    .orderBy(desc(count(postTags.postId)))
    .limit(limit);
}

export interface TagRef {
  id: string;
  slug: string;
  name: string;
}

export async function findTagBySlug(slug: string): Promise<TagRef | null> {
  const [row] = await db.select({ id: tags.id, slug: tags.slug, name: tags.name }).from(tags).where(eq(tags.slug, slug)).limit(1);
  return row ?? null;
}

export async function listPostsByTagAcrossSpaces(
  tagId: string,
  lang: "es" | "en",
  limit: number,
): Promise<CrossSpaceLatestItem[]> {
  const rows: LatestRow[] = await db
    .select({
      slug: posts.slug,
      title: posts.title,
      excerpt: posts.excerpt,
      publishedAt: posts.publishedAt,
      spaceSubdomain: spaces.subdomain,
      spaceAccentColor: spaces.accentColor,
    })
    .from(posts)
    .innerJoin(spaces, eq(posts.spaceId, spaces.id))
    .innerJoin(postTags, eq(postTags.postId, posts.id))
    .where(
      and(
        eq(postTags.tagId, tagId),
        eq(posts.lang, lang),
        eq(posts.status, "published"),
        isNull(spaces.archivedAt),
      ),
    )
    .orderBy(desc(posts.publishedAt), asc(posts.id))
    .limit(limit);

  return toLatestItems(rows);
}

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

  return rows.map((row) => {
    if (!row.publishedAt) {
      // Igual que en posts.ts: publishPost() fija status y published_at
      // juntos, un post "published" sin fecha es un estado imposible.
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

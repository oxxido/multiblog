import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { posts, postSlugs, spaces } from "../../db/schema.js";
import { renderMarkdown } from "../../markdown/pipeline.js";

const LIST_LIMIT = 200;

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
}

export interface SpaceOption {
  id: string;
  name: string;
}

export interface PostInput {
  spaceId: string;
  slug: string;
  title: string;
  excerpt: string | null;
  bodyMd: string;
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

export async function listSpaceOptions(): Promise<SpaceOption[]> {
  return db.select({ id: spaces.id, name: spaces.name }).from(spaces).limit(LIST_LIMIT);
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

  return row ?? null;
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

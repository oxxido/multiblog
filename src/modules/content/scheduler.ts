import { and, eq, lte, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { posts } from "../../db/schema.js";

// No toca published_at: un post `scheduled` ya lo tiene (la fecha
// programada), que pasa a ser la fecha real de publicación sin más ajuste
// (docs/slices/10.md §0).
export async function publishDuePosts(): Promise<number> {
  const rows = await db
    .update(posts)
    .set({ status: "published" })
    .where(and(eq(posts.status, "scheduled"), lte(posts.publishedAt, sql`now()`)))
    .returning({ id: posts.id });

  return rows.length;
}

export function startScheduledPublishJob(intervalMs = 60_000): () => void {
  const timer = setInterval(() => {
    publishDuePosts().catch((error: unknown) => {
      console.error("Error publicando posts programados", error);
    });
  }, intervalMs);

  return () => {
    clearInterval(timer);
  };
}

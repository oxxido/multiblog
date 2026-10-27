import { inArray, like } from "drizzle-orm";
import type { db } from "../../src/db/client.js";
import { categories, postSlugs, posts, spaces } from "../../src/db/schema.js";

const MAX_TEST_SPACES = 1000;

// `spaces` no tiene onDelete: cascade, así que hay que vaciar a mano lo que
// cuelga de ellos (post_slugs, posts, categories). Cada archivo de test usa
// un prefijo de slug propio, por eso borrar por prefijo es seguro aunque los
// archivos corran en paralelo.
export async function deleteSpacesByPrefix(database: typeof db, prefix: string): Promise<void> {
  const rows = await database
    .select({ id: spaces.id })
    .from(spaces)
    .where(like(spaces.slug, `${prefix}%`))
    .limit(MAX_TEST_SPACES);
  const ids = rows.map((row) => row.id);
  if (ids.length === 0) {
    return;
  }

  await database.transaction(async (tx) => {
    await tx.delete(postSlugs).where(inArray(postSlugs.spaceId, ids));
    await tx.delete(posts).where(inArray(posts.spaceId, ids));
    await tx.delete(categories).where(inArray(categories.spaceId, ids));
    await tx.delete(spaces).where(inArray(spaces.id, ids));
  });
}

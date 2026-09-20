import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { postTags, tags } from "../../db/schema.js";

export function slugifyTagName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Coma-separado, recorta espacios, descarta vacíos, dedupe case-insensitive
// preservando el primer casing con el que apareció (docs/slices/09.md §0).
export function parseTagNames(raw: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    names.push(trimmed);
  }

  return names;
}

// Si el slug ya existe, gana el nombre con el que se creó esa fila (§0): no
// se sobreescribe el casing de un tag ya creado por cómo lo tipeó otro post.
async function findOrCreateTagId(name: string): Promise<string> {
  const slug = slugifyTagName(name);

  const [existing] = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, slug)).limit(1);
  if (existing) {
    return existing.id;
  }

  const [created] = await db.insert(tags).values({ slug, name }).onConflictDoNothing({ target: tags.slug }).returning({ id: tags.id });
  if (created) {
    return created.id;
  }

  const [row] = await db.select({ id: tags.id }).from(tags).where(eq(tags.slug, slug)).limit(1);
  if (!row) {
    throw new Error(`No se pudo resolver el tag "${name}"`);
  }
  return row.id;
}

// Find-or-create secuencial (no Promise.all): si dos nombres del mismo post
// normalizan al mismo slug, el primero de la lista es el que crea la fila.
export async function syncPostTags(postId: string, names: string[]): Promise<void> {
  await db.delete(postTags).where(eq(postTags.postId, postId));

  const tagIds = new Set<string>();
  for (const name of names) {
    tagIds.add(await findOrCreateTagId(name));
  }

  if (tagIds.size === 0) {
    return;
  }

  await db.insert(postTags).values([...tagIds].map((tagId) => ({ postId, tagId })));
}

export async function tagNamesForPost(postId: string): Promise<string[]> {
  const rows = await db
    .select({ name: tags.name })
    .from(postTags)
    .innerJoin(tags, eq(postTags.tagId, tags.id))
    .where(eq(postTags.postId, postId));

  return rows.map((row) => row.name);
}

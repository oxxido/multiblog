import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { posts, spaces } from "../../db/schema.js";

const LIST_LIMIT = 200;

export interface SpaceSummary {
  id: string;
  slug: string;
  subdomain: string;
  name: string;
  archivedAt: Date | null;
}

export interface SpaceDetail {
  id: string;
  slug: string;
  subdomain: string;
  name: string;
  description: string | null;
  accentColor: string | null;
  archivedAt: Date | null;
  coverMediaId: string | null;
}

export interface SpaceInput {
  slug: string;
  subdomain: string;
  name: string;
  description: string | null;
  accentColor: string | null;
  coverMediaId: string | null;
}

export async function listSpaces(): Promise<SpaceSummary[]> {
  return db
    .select({
      id: spaces.id,
      slug: spaces.slug,
      subdomain: spaces.subdomain,
      name: spaces.name,
      archivedAt: spaces.archivedAt,
    })
    .from(spaces)
    .limit(LIST_LIMIT);
}

export async function getSpace(id: string): Promise<SpaceDetail | null> {
  const [row] = await db
    .select({
      id: spaces.id,
      slug: spaces.slug,
      subdomain: spaces.subdomain,
      name: spaces.name,
      description: spaces.description,
      accentColor: spaces.accentColor,
      archivedAt: spaces.archivedAt,
      coverMediaId: spaces.coverMediaId,
    })
    .from(spaces)
    .where(eq(spaces.id, id))
    .limit(1);

  return row ?? null;
}

export async function createSpace(input: SpaceInput): Promise<{ id: string }> {
  const [row] = await db.insert(spaces).values(input).returning({ id: spaces.id });

  if (!row) {
    throw new Error("No se pudo crear el espacio");
  }

  return row;
}

export async function updateSpace(id: string, input: SpaceInput): Promise<void> {
  await db.update(spaces).set(input).where(eq(spaces.id, id));
}

export async function archiveSpace(id: string): Promise<void> {
  await db.update(spaces).set({ archivedAt: new Date() }).where(eq(spaces.id, id));
}

export interface SpaceOption {
  id: string;
  name: string;
}

export async function listActiveSpaceOptions(): Promise<SpaceOption[]> {
  return db
    .select({ id: spaces.id, name: spaces.name })
    .from(spaces)
    .where(isNull(spaces.archivedAt))
    .limit(LIST_LIMIT);
}

// El formulario de edición de un post necesita poder mostrar el espacio
// actual del post aunque haya sido archivado después de crearlo — si no
// apareciera en el <select>, guardar el post sin tocarlo lo movería en
// silencio al primer espacio activo de la lista.
export async function listSpaceOptionsForPost(currentSpaceId: string): Promise<SpaceOption[]> {
  const active = await listActiveSpaceOptions();
  if (active.some((option) => option.id === currentSpaceId)) {
    return active;
  }

  const current = await getSpace(currentSpaceId);
  if (!current) {
    return active;
  }

  return [...active, { id: current.id, name: `${current.name} (archivado)` }];
}

export interface ActiveSpaceWithPostCount {
  slug: string;
  subdomain: string;
  name: string;
  description: string | null;
  accentColor: string | null;
  publishedCount: number;
}

export async function listActiveSpacesWithPostCounts(lang: "es" | "en"): Promise<ActiveSpaceWithPostCount[]> {
  return db
    .select({
      slug: spaces.slug,
      subdomain: spaces.subdomain,
      name: spaces.name,
      description: spaces.description,
      accentColor: spaces.accentColor,
      publishedCount: count(posts.id),
    })
    .from(spaces)
    .leftJoin(posts, and(eq(posts.spaceId, spaces.id), eq(posts.lang, lang), eq(posts.status, "published")))
    .where(isNull(spaces.archivedAt))
    .groupBy(spaces.id)
    .limit(LIST_LIMIT);
}

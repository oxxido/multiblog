import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { categories, spaces } from "../../db/schema.js";

const LIST_LIMIT = 200;

export interface CategorySummary {
  id: string;
  slug: string;
  name: string;
  spaceId: string;
  spaceName: string;
}

export interface CategoryDetail {
  id: string;
  spaceId: string;
  spaceName: string;
  slug: string;
  name: string;
  description: string | null;
}

export interface CategoryInput {
  slug: string;
  name: string;
  description: string | null;
}

export async function listCategories(): Promise<CategorySummary[]> {
  return db
    .select({
      id: categories.id,
      slug: categories.slug,
      name: categories.name,
      spaceId: categories.spaceId,
      spaceName: spaces.name,
    })
    .from(categories)
    .innerJoin(spaces, eq(categories.spaceId, spaces.id))
    .limit(LIST_LIMIT);
}

export async function getCategory(id: string): Promise<CategoryDetail | null> {
  const [row] = await db
    .select({
      id: categories.id,
      spaceId: categories.spaceId,
      spaceName: spaces.name,
      slug: categories.slug,
      name: categories.name,
      description: categories.description,
    })
    .from(categories)
    .innerJoin(spaces, eq(categories.spaceId, spaces.id))
    .where(eq(categories.id, id))
    .limit(1);

  return row ?? null;
}

export async function createCategory(spaceId: string, input: CategoryInput): Promise<{ id: string }> {
  const [row] = await db
    .insert(categories)
    .values({ spaceId, ...input })
    .returning({ id: categories.id });

  if (!row) {
    throw new Error("No se pudo crear la categoría");
  }

  return row;
}

export async function updateCategory(id: string, input: CategoryInput): Promise<void> {
  await db.update(categories).set(input).where(eq(categories.id, id));
}

export async function deleteCategory(id: string): Promise<void> {
  await db.delete(categories).where(eq(categories.id, id));
}

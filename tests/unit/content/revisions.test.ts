import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env.BASE_DOMAIN ??= "localhost";
process.env.DATABASE_URL ??= "postgres://multiblog:dev@localhost:5433/multiblog";

const { db, closeDb } = await import("../../../src/db/client.js");
const { spaces, posts, postRevisions } = await import("../../../src/db/schema.js");
const { diffAgainstPrevious } = await import("../../../src/modules/content/revisions.js");

after(closeDb);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createTestPost(): Promise<string> {
  const suffix = randomUUID().slice(0, 8);
  const [space] = await db
    .insert(spaces)
    .values({ slug: `espacio-rev-${suffix}`, subdomain: `espacio-rev-${suffix}`, name: `Espacio ${suffix}` })
    .returning({ id: spaces.id });
  if (!space) {
    throw new Error("No se pudo crear el espacio de prueba");
  }

  const [post] = await db
    .insert(posts)
    .values({ spaceId: space.id, slug: `post-rev-${suffix}`, title: `Post ${suffix}`, bodyMd: "cuerpo", bodyHtml: "<p>cuerpo</p>" })
    .returning({ id: posts.id });
  if (!post) {
    throw new Error("No se pudo crear el post de prueba");
  }

  return post.id;
}

test("diffAgainstPrevious da null en la primera revisión de un post", async () => {
  const postId = await createTestPost();
  const [revision] = await db.insert(postRevisions).values({ postId, bodyMd: "línea 1" }).returning({ id: postRevisions.id });
  if (!revision) {
    throw new Error("No se pudo crear la revisión de prueba");
  }

  const result = await diffAgainstPrevious(revision.id);
  assert.equal(result, null);
});

test("diffAgainstPrevious marca lo agregado y lo quitado contra la revisión inmediata anterior", async () => {
  const postId = await createTestPost();
  await db.insert(postRevisions).values({ postId, bodyMd: "línea 1\nlínea 2\n" });
  await sleep(5);
  const [second] = await db
    .insert(postRevisions)
    .values({ postId, bodyMd: "línea 1\nlínea 3\n" })
    .returning({ id: postRevisions.id });
  if (!second) {
    throw new Error("No se pudo crear la segunda revisión de prueba");
  }

  const result = await diffAgainstPrevious(second.id);
  assert.ok(result !== null);
  assert.match(result, /<del>línea 2\n<\/del>/);
  assert.match(result, /<ins>línea 3\n<\/ins>/);
});

test("diffAgainstPrevious escapa < y & del Markdown fuente", async () => {
  const postId = await createTestPost();
  await db.insert(postRevisions).values({ postId, bodyMd: "texto plano\n" });
  await sleep(5);
  const [second] = await db
    .insert(postRevisions)
    .values({ postId, bodyMd: "<script>&alert</script>\n" })
    .returning({ id: postRevisions.id });
  if (!second) {
    throw new Error("No se pudo crear la segunda revisión de prueba");
  }

  const result = await diffAgainstPrevious(second.id);
  assert.ok(result !== null);
  assert.doesNotMatch(result, /<script>/);
  assert.match(result, /&lt;script&gt;&amp;alert&lt;\/script&gt;/);
});

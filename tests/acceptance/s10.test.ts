import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { and, eq } from "drizzle-orm";

process.env.BASE_DOMAIN ??= "localhost";
process.env.DATABASE_URL ??= "postgres://multiblog:dev@localhost:5433/multiblog";

const { buildApp } = await import("../../src/app.js");
const { db, closeDb } = await import("../../src/db/client.js");
const { posts } = await import("../../src/db/schema.js");
const { hashPassword } = await import("../../src/modules/auth/password.js");
const { users } = await import("../../src/db/schema.js");
const { publishDuePosts } = await import("../../src/modules/content/scheduler.js");
const { listRevisions } = await import("../../src/modules/content/revisions.js");
const { importSpaceFromDirectory, exportSpaceToDirectory } = await import("../../src/modules/content/importExport.js");
const { listAllPostsForExport } = await import("../../src/modules/content/posts.js");
const { serializeFrontMatterFile } = await import("../../src/modules/content/frontmatter.js");

after(closeDb);

const ADMIN_EMAIL = "s10-acceptance@example.com";
const ADMIN_PASSWORD = "s10-acceptance-password";

async function ensureTestAdmin(): Promise<void> {
  const passwordHash = hashPassword(ADMIN_PASSWORD);
  await db
    .insert(users)
    .values({ email: ADMIN_EMAIL, passwordHash })
    .onConflictDoUpdate({ target: users.email, set: { passwordHash } });
}

function form(fields: Record<string, string>, cookie: string): { headers: Record<string, string>; payload: string } {
  return {
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    payload: new URLSearchParams(fields).toString(),
  };
}

type App = Awaited<ReturnType<typeof buildApp>>;

async function login(app: App): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/admin/login",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: new URLSearchParams({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }).toString(),
  });
  assert.equal(response.statusCode, 302);
  const sessionCookie = response.cookies.find((cookie) => cookie.name === "session");
  assert.ok(sessionCookie, "debe setear la cookie de sesión");
  return `session=${sessionCookie.value}`;
}

async function createSpace(app: App, cookie: string): Promise<{ id: string; slug: string; subdomain: string }> {
  const suffix = randomUUID().slice(0, 8);
  const slug = `espacio-s10-${suffix}`;
  const response = await app.inject({
    method: "POST",
    url: "/admin/espacios",
    ...form({ slug, subdomain: slug, name: `Espacio S10 ${suffix}`, description: "", accentColor: "" }, cookie),
  });
  assert.equal(response.statusCode, 302, response.body);
  const id = response.headers.location?.toString().split("/").pop();
  assert.ok(id);
  return { id, slug, subdomain: slug };
}

async function createCategory(app: App, cookie: string, spaceId: string): Promise<{ slug: string }> {
  const slug = `cat-s10-${randomUUID().slice(0, 8)}`;
  const response = await app.inject({
    method: "POST",
    url: "/admin/categorias",
    ...form({ spaceId, slug, name: slug, description: "" }, cookie),
  });
  assert.equal(response.statusCode, 302, response.body);
  return { slug };
}

async function createPost(
  app: App,
  cookie: string,
  spaceId: string,
  overrides: Partial<{ slug: string; title: string; excerpt: string; bodyMd: string }> = {},
): Promise<{ id: string; slug: string; title: string }> {
  const suffix = randomUUID().slice(0, 8);
  const slug = overrides.slug ?? `post-s10-${suffix}`;
  const title = overrides.title ?? `Post S10 ${suffix}`;

  const createResponse = await app.inject({
    method: "POST",
    url: "/admin/posts",
    ...form({ spaceId, slug, title, excerpt: overrides.excerpt ?? "" }, cookie),
  });
  assert.equal(createResponse.statusCode, 302, createResponse.body);
  const id = createResponse.headers.location?.toString().split("/").pop();
  assert.ok(id);

  const editResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${id}`,
    ...form({ spaceId, slug, title, excerpt: overrides.excerpt ?? "", bodyMd: overrides.bodyMd ?? `# ${title}\n\nCuerpo.` }, cookie),
  });
  assert.equal(editResponse.statusCode, 302, editResponse.body);

  return { id, slug, title };
}

await ensureTestAdmin();

test("programar un post a futuro no lo hace público; publishDuePosts() lo publica cuando la fecha ya pasó", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await createSpace(app, cookie);
  const post = await createPost(app, cookie, space.id);

  const futureLocal = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
  const scheduleResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${post.id}/schedule`,
    ...form({ publishAt: futureLocal }, cookie),
  });
  assert.equal(scheduleResponse.statusCode, 302, scheduleResponse.body);

  const notYetPublic = await app.inject({
    method: "GET",
    url: `/${post.slug}`,
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(notYetPublic.statusCode, 404);

  await db.update(posts).set({ publishedAt: new Date(Date.now() - 1000) }).where(eq(posts.id, post.id));
  await publishDuePosts();

  const nowPublic = await app.inject({
    method: "GET",
    url: `/${post.slug}`,
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(nowPublic.statusCode, 200);

  await app.close();
});

test("cancelar una programación devuelve el post a borrador sin published_at", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await createSpace(app, cookie);
  const post = await createPost(app, cookie, space.id);

  const futureLocal = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
  await app.inject({ method: "POST", url: `/admin/posts/${post.id}/schedule`, ...form({ publishAt: futureLocal }, cookie) });

  const cancelResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${post.id}/cancel-schedule`,
    headers: { cookie },
  });
  assert.equal(cancelResponse.statusCode, 302);

  const [row] = await db.select({ status: posts.status, publishedAt: posts.publishedAt }).from(posts).where(eq(posts.id, post.id));
  assert.ok(row);
  assert.equal(row.status, "draft");
  assert.equal(row.publishedAt, null);

  await app.close();
});

test("un borrador tiene un link de vista previa que lo muestra con aviso; rotar invalida el anterior; token de otro espacio o inexistente da 404", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await createSpace(app, cookie);
  const otherSpace = await createSpace(app, cookie);
  const draft = await createPost(app, cookie, space.id, { bodyMd: "Contenido del borrador en preview." });

  const formPage = await app.inject({ method: "GET", url: `/admin/posts/${draft.id}`, headers: { cookie } });
  assert.equal(formPage.statusCode, 200);
  const match = /_preview\/([0-9a-f-]{36})/.exec(formPage.body);
  assert.ok(match, "el formulario debe mostrar el link de vista previa");
  const token = match[1];
  assert.ok(token);

  const previewResponse = await app.inject({
    method: "GET",
    url: `/_preview/${token}`,
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(previewResponse.statusCode, 200);
  assert.match(previewResponse.body, /Vista previa/);
  assert.match(previewResponse.body, /Contenido del borrador en preview/);

  const wrongSpaceResponse = await app.inject({
    method: "GET",
    url: `/_preview/${token}`,
    headers: { host: `${otherSpace.subdomain}.localhost` },
  });
  assert.equal(wrongSpaceResponse.statusCode, 404);

  const missingResponse = await app.inject({
    method: "GET",
    url: `/_preview/${randomUUID()}`,
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(missingResponse.statusCode, 404);

  const rotateResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${draft.id}/rotate-preview-token`,
    headers: { cookie },
  });
  assert.equal(rotateResponse.statusCode, 302);

  const oldTokenResponse = await app.inject({
    method: "GET",
    url: `/_preview/${token}`,
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(oldTokenResponse.statusCode, 404);

  const formPageAfterRotate = await app.inject({ method: "GET", url: `/admin/posts/${draft.id}`, headers: { cookie } });
  const matchAfterRotate = /_preview\/([0-9a-f-]{36})/.exec(formPageAfterRotate.body);
  assert.ok(matchAfterRotate);
  const newToken = matchAfterRotate[1];
  assert.ok(newToken);
  assert.notEqual(newToken, token);

  const newTokenResponse = await app.inject({
    method: "GET",
    url: `/_preview/${newToken}`,
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(newTokenResponse.statusCode, 200);

  await app.close();
});

test("guardar el formulario completo registra una revisión sólo si body_md cambió; el autosave nunca lo hace; el admin muestra el diff", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await createSpace(app, cookie);
  const post = await createPost(app, cookie, space.id, { bodyMd: "Cuerpo original." });

  let revisions = await listRevisions(post.id);
  assert.equal(revisions.length, 1);

  await app.inject({
    method: "POST",
    url: `/admin/posts/${post.id}`,
    ...form({ spaceId: space.id, slug: post.slug, title: post.title, excerpt: "", bodyMd: "Cuerpo original." }, cookie),
  });
  revisions = await listRevisions(post.id);
  assert.equal(revisions.length, 1, "guardar sin cambios no debe duplicar la revisión");

  await app.inject({
    method: "POST",
    url: `/admin/posts/${post.id}`,
    ...form({ spaceId: space.id, slug: post.slug, title: post.title, excerpt: "", bodyMd: "Cuerpo modificado." }, cookie),
  });
  revisions = await listRevisions(post.id);
  assert.equal(revisions.length, 2, "cambiar el cuerpo debe crear una revisión nueva");

  await app.inject({
    method: "POST",
    url: `/admin/posts/${post.id}/autosave`,
    ...form({ bodyMd: "Cuerpo tocado por autosave." }, cookie),
  });
  revisions = await listRevisions(post.id);
  assert.equal(revisions.length, 2, "el autosave nunca debe generar una revisión");

  const diffPage = await app.inject({
    method: "GET",
    url: `/admin/posts/${post.id}/revisions/${revisions[0]?.id ?? ""}/diff`,
    headers: { cookie },
  });
  assert.equal(diffPage.statusCode, 200);
  assert.match(diffPage.body, /<ins>|<del>/);

  await app.close();
});

test("import/export: importar un lote crea posts con categorías y tags; exportar, borrar y reimportar produce contenido equivalente; translation_of agrupa la traducción", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await createSpace(app, cookie);
  const categoryA = await createCategory(app, cookie, space.id);
  const categoryB = await createCategory(app, cookie, space.id);

  const suffix = randomUUID().slice(0, 8);
  const importDir = await mkdtemp(path.join(tmpdir(), "multiblog-s10-import-"));
  const esDir = path.join(importDir, "es");
  const enDir = path.join(importDir, "en");
  await mkdir(esDir, { recursive: true });
  await mkdir(enDir, { recursive: true });

  const esItems = Array.from({ length: 19 }, (_, index) => ({
    slug: `import-es-${suffix}-${index.toString()}`,
    title: `Post importado ${index.toString()}`,
    excerpt: `Extracto ${index.toString()}`,
    categories: index % 2 === 0 ? categoryA.slug : categoryB.slug,
    tags: `tag-import-${suffix}, tag-comun-${suffix}`,
    bodyMd: `# Post importado ${index.toString()}\n\nCuerpo del post ${index.toString()}.\n`,
  }));

  for (const item of esItems) {
    const content = serializeFrontMatterFile(
      {
        title: item.title,
        slug: item.slug,
        status: "published",
        published_at: "2026-01-01T00:00:00.000Z",
        excerpt: item.excerpt,
        categories: item.categories,
        tags: item.tags,
      },
      item.bodyMd,
    );
    await writeFile(path.join(esDir, `${item.slug}.md`), content, "utf8");
  }

  const enSlug = `import-en-${suffix}-0`;
  const enItem = {
    slug: enSlug,
    title: "Imported post 0",
    excerpt: "Excerpt 0",
    bodyMd: "# Imported post 0\n\nBody of post 0.\n",
    translationOf: esItems[0]?.slug ?? "",
  };
  await writeFile(
    path.join(enDir, `${enSlug}.md`),
    serializeFrontMatterFile(
      {
        title: enItem.title,
        slug: enItem.slug,
        status: "published",
        published_at: "2026-01-01T00:00:00.000Z",
        excerpt: enItem.excerpt,
        translation_of: enItem.translationOf,
      },
      enItem.bodyMd,
    ),
    "utf8",
  );

  const importSummary = await importSpaceFromDirectory(space.slug, importDir);
  assert.equal(importSummary.created, 20);
  assert.equal(importSummary.updated, 0);

  const esExported = await listAllPostsForExport(space.id, "es");
  const enExported = await listAllPostsForExport(space.id, "en");
  assert.equal(esExported.length, 19);
  assert.equal(enExported.length, 1);

  const importedSample = esExported.find((item) => item.slug === esItems[0]?.slug);
  assert.ok(importedSample);
  assert.deepEqual(importedSample.categorySlugs.sort(), [categoryA.slug]);
  assert.deepEqual(
    importedSample.tagNames.slice().sort(),
    [`tag-comun-${suffix}`, `tag-import-${suffix}`].sort(),
  );

  const [esRow] = await db
    .select({ id: posts.id, translationGroupId: posts.translationGroupId })
    .from(posts)
    .where(and(eq(posts.spaceId, space.id), eq(posts.lang, "es"), eq(posts.slug, esItems[0]?.slug ?? "")));
  const [enRow] = await db
    .select({ translationGroupId: posts.translationGroupId, sourcePostId: posts.sourcePostId })
    .from(posts)
    .where(and(eq(posts.spaceId, space.id), eq(posts.lang, "en"), eq(posts.slug, enSlug)));

  assert.ok(esRow);
  assert.ok(enRow);
  assert.equal(enRow.translationGroupId, esRow.translationGroupId);
  assert.equal(enRow.sourcePostId, esRow.id);

  const exportDir = await mkdtemp(path.join(tmpdir(), "multiblog-s10-export-"));
  const exportSummary = await exportSpaceToDirectory(space.slug, exportDir);
  assert.equal(exportSummary.exported, 20);

  await db.delete(posts).where(eq(posts.spaceId, space.id));
  const afterDelete = await listAllPostsForExport(space.id, "es");
  assert.equal(afterDelete.length, 0);

  const reimportSummary = await importSpaceFromDirectory(space.slug, exportDir);
  assert.equal(reimportSummary.created, 20);
  assert.equal(reimportSummary.updated, 0);

  const esReimported = await listAllPostsForExport(space.id, "es");
  const enReimported = await listAllPostsForExport(space.id, "en");

  for (const original of esItems) {
    const reimported = esReimported.find((item) => item.slug === original.slug);
    assert.ok(reimported, `falta el post reimportado ${original.slug}`);
    assert.equal(reimported.title, original.title);
    assert.equal(reimported.status, "published");
    assert.equal(reimported.excerpt, original.excerpt);
    assert.equal(reimported.bodyMd, original.bodyMd);
    assert.deepEqual(reimported.categorySlugs.sort(), [original.categories].sort());
    assert.deepEqual(reimported.tagNames.slice().sort(), original.tags.split(", ").sort());
  }

  const enReimportedItem = enReimported.find((item) => item.slug === enSlug);
  assert.ok(enReimportedItem);
  assert.equal(enReimportedItem.title, enItem.title);
  assert.equal(enReimportedItem.bodyMd, enItem.bodyMd);
  assert.equal(enReimportedItem.translationOfSlug, enItem.translationOf);

  await rm(importDir, { recursive: true, force: true });
  await rm(exportDir, { recursive: true, force: true });

  await app.close();
});

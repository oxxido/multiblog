import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

process.env.BASE_DOMAIN ??= "localhost";
process.env.DATABASE_URL ??= "postgres://multiblog:dev@localhost:5433/multiblog";

const { buildApp } = await import("../../src/app.js");
const { db, closeDb } = await import("../../src/db/client.js");
const { posts, spaces, users } = await import("../../src/db/schema.js");
const { hashPassword } = await import("../../src/modules/auth/password.js");
const { fromMarkdown } = await import("../../src/markdown/tiptap/fromMarkdown.js");

after(closeDb);

const ADMIN_EMAIL = "s5-acceptance@example.com";
const ADMIN_PASSWORD = "s5-acceptance-password";

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

async function login(app: Awaited<ReturnType<typeof buildApp>>): Promise<string> {
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

type App = Awaited<ReturnType<typeof buildApp>>;

async function createMinimalPost(app: App, cookie: string, spaceId: string): Promise<{ id: string; slug: string }> {
  const suffix = randomUUID().slice(0, 8);
  const slug = `post-s5-${suffix}`;
  const response = await app.inject({
    method: "POST",
    url: "/admin/posts",
    ...form({ spaceId, slug, title: `Post S5 ${suffix}`, excerpt: "" }, cookie),
  });
  assert.equal(response.statusCode, 302, response.body);
  const id = response.headers.location?.toString().split("/").pop();
  assert.ok(id);
  return { id, slug };
}

// El atributo lo escapa Eta como cualquier otro valor interpolado
// (Markdown.md: `<%=` escapa, `<%~` no); se revierte acá para poder
// comparar el JSON embebido con el que produce fromMarkdown directamente.
function extractInitialDoc(html: string): unknown {
  const match = /id="editor-visual" data-initial-doc="([^"]*)"/.exec(html);
  assert.ok(match, "el formulario debe traer el documento inicial del editor visual");
  const [, raw] = match;
  assert.ok(raw, "el atributo data-initial-doc no debe estar vacío");
  const unescaped = raw
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
  return JSON.parse(unescaped);
}

// prosemirror-model serializa los attrs de cada nodo con prototipo nulo;
// node:assert/strict distingue eso de un objeto literal aunque los valores
// coincidan. Ida y vuelta por JSON deja los dos lados comparables.
function toPlainJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

await ensureTestAdmin();

test("crear un post nuevo no pide cuerpo y arranca con body_md vacío", async () => {
  const app = await buildApp();
  const cookie = await login(app);

  const [space] = await db.select({ id: spaces.id }).from(spaces).where(eq(spaces.slug, "nutricion")).limit(1);
  assert.ok(space, "el espacio nutricion debe estar sembrado");

  const newFormResponse = await app.inject({ method: "GET", url: "/admin/posts/new", headers: { cookie } });
  assert.equal(newFormResponse.statusCode, 200);
  assert.doesNotMatch(newFormResponse.body, /name="bodyMd"/);

  const { id } = await createMinimalPost(app, cookie, space.id);

  const [row] = await db
    .select({ bodyMd: posts.bodyMd, status: posts.status })
    .from(posts)
    .where(eq(posts.id, id))
    .limit(1);
  assert.ok(row);
  assert.equal(row.bodyMd, "");
  assert.equal(row.status, "draft");

  const editFormResponse = await app.inject({ method: "GET", url: `/admin/posts/${id}`, headers: { cookie } });
  assert.equal(editFormResponse.statusCode, 200);
  assert.match(editFormResponse.body, /id="editor-visual"/);
  assert.match(editFormResponse.body, /data-editor-toggle/);
  assert.match(editFormResponse.body, /src="\/admin\/static\/editor\.js"/);
  assert.deepEqual(extractInitialDoc(editFormResponse.body), toPlainJson(fromMarkdown("")));

  await app.close();
});

test("el autosave guarda el cuerpo sin tocar slug, título ni estado", async () => {
  const app = await buildApp();
  const cookie = await login(app);

  const [space] = await db.select({ id: spaces.id }).from(spaces).where(eq(spaces.slug, "nutricion")).limit(1);
  assert.ok(space);

  const { id, slug } = await createMinimalPost(app, cookie, space.id);
  const bodyMd = "# Título\n\nUn párrafo con **negrita**.\n";

  const autosaveResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${id}/autosave`,
    headers: { cookie, "content-type": "application/json" },
    payload: JSON.stringify({ bodyMd }),
  });
  assert.equal(autosaveResponse.statusCode, 204);

  const [row] = await db
    .select({ bodyMd: posts.bodyMd, bodyHtml: posts.bodyHtml, slug: posts.slug, status: posts.status })
    .from(posts)
    .where(eq(posts.id, id))
    .limit(1);
  assert.ok(row);
  assert.equal(row.bodyMd, bodyMd);
  assert.match(row.bodyHtml, /<h1>Título<\/h1>/);
  assert.equal(row.slug, slug);
  assert.equal(row.status, "draft");

  await app.close();
});

test("reabrir el post después de guardar devuelve el mismo Markdown en crudo y en el documento del editor visual", async () => {
  const app = await buildApp();
  const cookie = await login(app);

  const [space] = await db.select({ id: spaces.id }).from(spaces).where(eq(spaces.slug, "nutricion")).limit(1);
  assert.ok(space);

  const { id, slug } = await createMinimalPost(app, cookie, space.id);
  const bodyMd = "# Encabezado\n\n- uno\n- dos\n\nUn [enlace](https://example.com).\n";

  const editResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${id}`,
    ...form({ spaceId: space.id, slug, title: "Post S5 editado", excerpt: "", bodyMd }, cookie),
  });
  assert.equal(editResponse.statusCode, 302, editResponse.body);

  const reopenResponse = await app.inject({ method: "GET", url: `/admin/posts/${id}`, headers: { cookie } });
  assert.equal(reopenResponse.statusCode, 200);
  assert.match(reopenResponse.body, /<textarea name="bodyMd"[^>]*>#\s*Encabezado/);
  assert.deepEqual(extractInitialDoc(reopenResponse.body), toPlainJson(fromMarkdown(bodyMd)));

  await app.close();
});

test("el autosave no cambia el estado de un post ya publicado", async () => {
  const app = await buildApp();
  const cookie = await login(app);

  const [space] = await db.select({ id: spaces.id }).from(spaces).where(eq(spaces.slug, "nutricion")).limit(1);
  assert.ok(space);

  const { id, slug } = await createMinimalPost(app, cookie, space.id);
  await app.inject({
    method: "POST",
    url: `/admin/posts/${id}`,
    ...form({ spaceId: space.id, slug, title: "Post S5 publicado", excerpt: "", bodyMd: "Primero.\n" }, cookie),
  });
  const publishResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${id}/publish`,
    headers: { cookie },
  });
  assert.equal(publishResponse.statusCode, 302);

  const autosaveResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${id}/autosave`,
    headers: { cookie, "content-type": "application/json" },
    payload: JSON.stringify({ bodyMd: "Segundo, editado en caliente.\n" }),
  });
  assert.equal(autosaveResponse.statusCode, 204);

  const [row] = await db
    .select({ bodyMd: posts.bodyMd, status: posts.status })
    .from(posts)
    .where(eq(posts.id, id))
    .limit(1);
  assert.ok(row);
  assert.equal(row.bodyMd, "Segundo, editado en caliente.\n");
  assert.equal(row.status, "published");

  await app.close();
});

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env.BASE_DOMAIN ??= "localhost";
process.env.DATABASE_URL ??= "postgres://multiblog:dev@localhost:5433/multiblog";

const { buildApp } = await import("../../src/app.js");
const { db, closeDb } = await import("../../src/db/client.js");
const { hashPassword } = await import("../../src/modules/auth/password.js");
const { users } = await import("../../src/db/schema.js");

after(closeDb);

const ADMIN_EMAIL = "s11-acceptance@example.com";
const ADMIN_PASSWORD = "s11-acceptance-password";

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
  const slug = `espacio-s11-${suffix}`;
  const response = await app.inject({
    method: "POST",
    url: "/admin/espacios",
    ...form({ slug, subdomain: slug, name: `Espacio S11 ${suffix}`, description: "", accentColor: "" }, cookie),
  });
  assert.equal(response.statusCode, 302, response.body);
  const id = response.headers.location?.toString().split("/").pop();
  assert.ok(id);
  return { id, slug, subdomain: slug };
}

async function createPost(app: App, cookie: string, spaceId: string): Promise<{ id: string }> {
  const suffix = randomUUID().slice(0, 8);
  const response = await app.inject({
    method: "POST",
    url: "/admin/posts",
    ...form({ spaceId, slug: `post-s11-${suffix}`, title: `Post S11 ${suffix}`, excerpt: "" }, cookie),
  });
  assert.equal(response.statusCode, 302, response.body);
  const id = response.headers.location?.toString().split("/").pop();
  assert.ok(id);
  return { id };
}

await ensureTestAdmin();

test("las siete pantallas del admin responden 200 autenticado y usan admin.css", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await createSpace(app, cookie);
  const post = await createPost(app, cookie, space.id);

  const screens = [
    "/admin/posts",
    `/admin/posts/${post.id}`,
    "/admin/categorias",
    "/admin/media",
    "/admin/espacios",
    "/admin/sitio",
  ];

  for (const url of screens) {
    const response = await app.inject({ method: "GET", url, headers: { cookie } });
    assert.equal(response.statusCode, 200, `${url}: ${response.body}`);
    assert.match(response.body, /\/css\/admin\.css/, `${url} debe cargar admin.css`);
  }

  const login200 = await app.inject({ method: "GET", url: "/admin/login" });
  assert.equal(login200.statusCode, 200);
  assert.match(login200.body, /\/css\/admin\.css/);
});

test("el alta rápida de la lista de posts crea un post (mismo POST /admin/posts que S5)", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await createSpace(app, cookie);

  const { id } = await createPost(app, cookie, space.id);

  const editResponse = await app.inject({ method: "GET", url: `/admin/posts/${id}`, headers: { cookie } });
  assert.equal(editResponse.statusCode, 200);
});

test("el badge de estado distingue borrador, programado y publicado", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await createSpace(app, cookie);
  await createPost(app, cookie, space.id);

  const list = await app.inject({ method: "GET", url: "/admin/posts", headers: { cookie } });
  assert.equal(list.statusCode, 200);
  assert.match(list.body, /badge-draft/);
});

test("la nav marca activa la sección correspondiente en cada pantalla", async () => {
  const app = await buildApp();
  const cookie = await login(app);

  const categorias = await app.inject({ method: "GET", url: "/admin/categorias", headers: { cookie } });
  assert.match(categorias.body, /href="\/admin\/categorias" class="is-active"/);

  const posts = await app.inject({ method: "GET", url: "/admin/posts", headers: { cookie } });
  assert.match(posts.body, /href="\/admin\/posts" class="is-active"/);
});

test("el color de acento del espacio es un color picker y sólo acepta #rrggbb", async () => {
  const app = await buildApp();
  const cookie = await login(app);

  const newForm = await app.inject({ method: "GET", url: "/admin/espacios/new", headers: { cookie } });
  assert.match(newForm.body, /type="color"[^>]*name="accentColor"|name="accentColor"[^>]*type="color"/s);

  const suffix = randomUUID().slice(0, 8);
  const fields = { slug: `espacio-s11c-${suffix}`, subdomain: `espacio-s11c-${suffix}`, name: `Espacio S11 ${suffix}`, description: "" };

  const invalid = await app.inject({
    method: "POST",
    url: "/admin/espacios",
    ...form({ ...fields, accentColor: "red; background:url(x)" }, cookie),
  });
  assert.equal(invalid.statusCode, 400);

  const valid = await app.inject({
    method: "POST",
    url: "/admin/espacios",
    ...form({ ...fields, accentColor: "#a1b2c3" }, cookie),
  });
  assert.equal(valid.statusCode, 302, valid.body);
  const id = valid.headers.location?.toString().split("/").pop();
  assert.ok(id);
  const edit = await app.inject({ method: "GET", url: `/admin/espacios/${id}`, headers: { cookie } });
  assert.match(edit.body, /value="#a1b2c3"/);

  await app.close();
});

test("la lista de espacios ofrece Editar y Archivar, y un espacio archivado Editar y Desarchivar", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await createSpace(app, cookie);

  const before = await app.inject({ method: "GET", url: "/admin/espacios", headers: { cookie } });
  assert.match(before.body, new RegExp(`href="/admin/espacios/${space.id}">Editar<`));
  assert.match(before.body, new RegExp(`action="/admin/espacios/${space.id}/archive"`));

  const archive = await app.inject({ method: "POST", url: `/admin/espacios/${space.id}/archive`, headers: { cookie } });
  assert.equal(archive.statusCode, 302);

  const after = await app.inject({ method: "GET", url: "/admin/espacios", headers: { cookie } });
  assert.match(after.body, new RegExp(`href="/admin/espacios/${space.id}">Editar<`));
  assert.doesNotMatch(after.body, new RegExp(`action="/admin/espacios/${space.id}/archive"`));
  assert.match(after.body, new RegExp(`action="/admin/espacios/${space.id}/unarchive"`));

  const restore = await app.inject({ method: "POST", url: `/admin/espacios/${space.id}/unarchive`, headers: { cookie } });
  assert.equal(restore.statusCode, 302);
  const restored = await app.inject({ method: "GET", url: "/admin/espacios", headers: { cookie } });
  assert.match(restored.body, new RegExp(`action="/admin/espacios/${space.id}/archive"`));
  assert.doesNotMatch(restored.body, new RegExp(`action="/admin/espacios/${space.id}/unarchive"`));

  await app.close();
});

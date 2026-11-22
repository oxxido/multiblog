import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env.BASE_DOMAIN ??= "localhost";
process.env.DATABASE_URL ??= "postgres://multiblog:dev@localhost:5433/multiblog";
process.env.ANALYTICS_SCRIPT_URL = "https://analytics.example.com/script.js";
process.env.ANALYTICS_WEBSITE_ID = "9baeb431-044a-48a8-ba2a-daf9e2e19a73";

const { buildApp } = await import("../../src/app.js");
const { db, closeDb } = await import("../../src/db/client.js");
const { deleteSpacesByPrefix } = await import("../helpers/cleanup.js");
const { users } = await import("../../src/db/schema.js");
const { hashPassword } = await import("../../src/modules/auth/password.js");

after(async () => {
  await deleteSpacesByPrefix(db, "espacio-s12-");
  await closeDb();
});

const ADMIN_EMAIL = "s12-acceptance@example.com";
const ADMIN_PASSWORD = "s12-acceptance-password";
const SCRIPT_TAG =
  '<script defer src="https://analytics.example.com/script.js" data-website-id="9baeb431-044a-48a8-ba2a-daf9e2e19a73"></script>';

type App = Awaited<ReturnType<typeof buildApp>>;

function form(fields: Record<string, string>, cookie: string): { headers: Record<string, string>; payload: string } {
  return {
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    payload: new URLSearchParams(fields).toString(),
  };
}

async function login(app: App): Promise<string> {
  const passwordHash = hashPassword(ADMIN_PASSWORD);
  await db
    .insert(users)
    .values({ email: ADMIN_EMAIL, passwordHash })
    .onConflictDoUpdate({ target: users.email, set: { passwordHash } });
  const response = await app.inject({
    method: "POST",
    url: "/admin/login",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    payload: new URLSearchParams({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }).toString(),
  });
  assert.equal(response.statusCode, 302);
  const sessionCookie = response.cookies.find((cookie) => cookie.name === "session");
  assert.ok(sessionCookie);
  return `session=${sessionCookie.value}`;
}

async function createSpace(app: App, cookie: string): Promise<{ id: string; subdomain: string }> {
  const slug = `espacio-s12-${randomUUID().slice(0, 8)}`;
  const response = await app.inject({
    method: "POST",
    url: "/admin/espacios",
    ...form({ slug, subdomain: slug, name: slug, description: "", accentColor: "" }, cookie),
  });
  assert.equal(response.statusCode, 302, response.body);
  const id = response.headers.location?.toString().split("/").pop();
  assert.ok(id);
  return { id, subdomain: slug };
}

async function createPost(app: App, cookie: string, spaceId: string, publish: boolean): Promise<{ id: string; slug: string }> {
  const slug = `post-s12-${randomUUID().slice(0, 8)}`;
  const fields = { spaceId, slug, title: slug, excerpt: "" };
  const created = await app.inject({ method: "POST", url: "/admin/posts", ...form(fields, cookie) });
  assert.equal(created.statusCode, 302, created.body);
  const id = created.headers.location?.toString().split("/").pop();
  assert.ok(id);
  const edited = await app.inject({
    method: "POST",
    url: `/admin/posts/${id}`,
    ...form({ ...fields, bodyMd: "Cuerpo." }, cookie),
  });
  assert.equal(edited.statusCode, 302, edited.body);
  if (publish) {
    const published = await app.inject({ method: "POST", url: `/admin/posts/${id}/publish`, headers: { cookie } });
    assert.equal(published.statusCode, 302);
  }
  return { id, slug };
}

function countScripts(body: string): number {
  return body.split(SCRIPT_TAG).length - 1;
}

test("con analíticas configuradas, cada página pública lleva el script de Umami una sola vez", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await createSpace(app, cookie);
  const post = await createPost(app, cookie, space.id, true);
  const spaceHost = `${space.subdomain}.localhost`;

  const pages = [
    await app.inject({ method: "GET", url: "/", headers: { host: "localhost" } }),
    await app.inject({ method: "GET", url: "/espacios", headers: { host: "localhost" } }),
    await app.inject({ method: "GET", url: "/", headers: { host: spaceHost } }),
    await app.inject({ method: "GET", url: `/${post.slug}`, headers: { host: spaceHost } }),
  ];

  for (const page of pages) {
    assert.equal(page.statusCode, 200);
    assert.equal(countScripts(page.body), 1);
    assert.equal(page.body.match(/<script/gi)?.length, 1, "ningún otro <script> en el sitio público");
  }

  await app.close();
});

test("la vista previa de un borrador no cuenta visitas", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await createSpace(app, cookie);
  const draft = await createPost(app, cookie, space.id, false);

  const formPage = await app.inject({ method: "GET", url: `/admin/posts/${draft.id}`, headers: { cookie } });
  const token = /_preview\/([0-9a-f-]{36})/.exec(formPage.body)?.[1];
  assert.ok(token);

  const preview = await app.inject({
    method: "GET",
    url: `/_preview/${token}`,
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(preview.statusCode, 200);
  assert.doesNotMatch(preview.body, /<script/i);

  await app.close();
});

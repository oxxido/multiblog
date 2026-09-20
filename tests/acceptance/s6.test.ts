import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

process.env.BASE_DOMAIN ??= "localhost";
process.env.DATABASE_URL ??= "postgres://multiblog:dev@localhost:5433/multiblog";

const { buildApp } = await import("../../src/app.js");
const { db, closeDb } = await import("../../src/db/client.js");
const { spaces, users } = await import("../../src/db/schema.js");
const { hashPassword } = await import("../../src/modules/auth/password.js");

after(closeDb);

const ADMIN_EMAIL = "s6-acceptance@example.com";
const ADMIN_PASSWORD = "s6-acceptance-password";

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

async function createMinimalPost(app: App, cookie: string, spaceId: string): Promise<{ id: string; slug: string }> {
  const suffix = randomUUID().slice(0, 8);
  const slug = `post-s6-${suffix}`;
  const response = await app.inject({
    method: "POST",
    url: "/admin/posts",
    ...form({ spaceId, slug, title: `Post S6 ${suffix}`, excerpt: "" }, cookie),
  });
  assert.equal(response.statusCode, 302, response.body);
  const id = response.headers.location?.toString().split("/").pop();
  assert.ok(id);
  return { id, slug };
}

async function publishWithBody(app: App, cookie: string, spaceId: string, bodyMd: string): Promise<string> {
  const { id, slug } = await createMinimalPost(app, cookie, spaceId);
  const saveResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${id}`,
    ...form({ spaceId, slug, title: `Post S6 ${slug}`, excerpt: "", bodyMd }, cookie),
  });
  assert.equal(saveResponse.statusCode, 302, saveResponse.body);
  const publishResponse = await app.inject({ method: "POST", url: `/admin/posts/${id}/publish`, headers: { cookie } });
  assert.equal(publishResponse.statusCode, 302, publishResponse.body);
  return slug;
}

await ensureTestAdmin();

test("los tres bloques se renderizan en el sitio público con las clases esperadas", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const [space] = await db.select({ id: spaces.id, subdomain: spaces.subdomain }).from(spaces).where(eq(spaces.slug, "nutricion")).limit(1);
  assert.ok(space);

  const bodyMd = [
    ':::callout{type="warning"}',
    "Cuidado con esto.",
    ":::",
    "",
    ':::gallery{cols="3"}',
    "![Un gato](https://example.com/a.jpg)",
    "",
    "![](https://example.com/b.jpg)",
    ":::",
    "",
    '::youtube[dQw4w9WgXcQ]{title="Nunca me des"}',
    "",
  ].join("\n");

  const slug = await publishWithBody(app, cookie, space.id, bodyMd);

  const response = await app.inject({
    method: "GET",
    url: `/${slug}`,
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(response.statusCode, 200);

  assert.match(response.body, /<div class="callout callout--warning">/);
  assert.match(response.body, /<p class="callout__label">Atención<\/p>/);
  assert.match(response.body, /<div class="gallery__grid" style="--gallery-cols: 3">/);
  assert.match(response.body, /class="blueprint gallery__frame"/);
  assert.match(
    response.body,
    /<iframe src="https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ" title="Nunca me des" loading="lazy">/,
  );

  await app.close();
});

test("un atributo inválido cae a su valor por defecto sin romper el resto del post", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const [space] = await db.select({ id: spaces.id, subdomain: spaces.subdomain }).from(spaces).where(eq(spaces.slug, "nutricion")).limit(1);
  assert.ok(space);

  const bodyMd = [
    ':::callout{type="peligro"}',
    "Antes del inválido.",
    ":::",
    "",
    ':::gallery{cols="9"}',
    "![Foto](https://example.com/c.jpg)",
    ":::",
    "",
    "Después de los dos bloques, el post sigue.",
    "",
  ].join("\n");

  const slug = await publishWithBody(app, cookie, space.id, bodyMd);

  const response = await app.inject({
    method: "GET",
    url: `/${slug}`,
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(response.statusCode, 200);

  assert.match(response.body, /<div class="callout callout--info">/);
  assert.match(response.body, /<div class="gallery__grid" style="--gallery-cols: 2">/);
  assert.match(response.body, /Después de los dos bloques, el post sigue\./);

  await app.close();
});

test("un intento de inyección dentro de un bloque no sobrevive el saneado", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const [space] = await db.select({ id: spaces.id, subdomain: spaces.subdomain }).from(spaces).where(eq(spaces.slug, "nutricion")).limit(1);
  assert.ok(space);

  const bodyMd = [
    ':::callout{type="warning"}',
    "Antes del intento.",
    ":::",
    "",
    "<script>alert(1)</script>",
    "",
    '![<img src=x onerror="alert(1)">](https://example.com/a.jpg "\\" onmouseover=\\"alert(2)")',
    "",
    "::youtube[dQw4w9WgXcQ]",
    "",
  ].join("\n");

  const slug = await publishWithBody(app, cookie, space.id, bodyMd);

  const response = await app.inject({
    method: "GET",
    url: `/${slug}`,
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(response.statusCode, 200);

  // El `<script>` de Markdown crudo no llega al hast (remark-rehype con
  // `allowDangerousHtml` en falso por defecto) — invariante 3 y 4 a la vez.
  assert.doesNotMatch(response.body, /<script/);
  // El alt y el title de la imagen quedan como texto inerte: las comillas
  // que intentan cerrar el atributo antes de tiempo están escapadas
  // (`&#x22;`), así que `onerror`/`onmouseover` nunca son atributos reales.
  assert.doesNotMatch(response.body, /\bonmouseover\s*=\s*"/);
  assert.match(response.body, /alt="<img src=x onerror=&#x22;alert\(1\)&#x22;>" title="&#x22; onmouseover=&#x22;alert\(2\)"/);

  await app.close();
});

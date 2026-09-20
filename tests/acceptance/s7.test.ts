import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { desc, eq } from "drizzle-orm";

process.env.BASE_DOMAIN ??= "localhost";
process.env.DATABASE_URL ??= "postgres://multiblog:dev@localhost:5433/multiblog";

const { buildApp } = await import("../../src/app.js");
const { db, closeDb } = await import("../../src/db/client.js");
const { media, spaces, users } = await import("../../src/db/schema.js");
const { hashPassword } = await import("../../src/modules/auth/password.js");

after(closeDb);

const ADMIN_EMAIL = "s7-acceptance@example.com";
const ADMIN_PASSWORD = "s7-acceptance-password";
const FIXTURE_PATH = path.join(import.meta.dirname, "../fixtures/sample.jpg");

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

// @fastify/multipart no trae un cliente de pruebas: se arma el cuerpo a
// mano, un único campo de archivo, igual de válido para busboy que el que
// generaría un <form enctype="multipart/form-data"> real.
function multipartUpload(
  buffer: Buffer,
  filename: string,
  contentType: string,
  cookie: string,
): { headers: Record<string, string>; payload: Buffer } {
  const boundary = `----multiblogtest${randomUUID()}`;
  const preamble = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`;
  const epilogue = `\r\n--${boundary}--\r\n`;
  return {
    headers: { "content-type": `multipart/form-data; boundary=${boundary}`, cookie },
    payload: Buffer.concat([Buffer.from(preamble), buffer, Buffer.from(epilogue)]),
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

async function uploadFixture(app: App, cookie: string): Promise<{ id: string; filename: string }> {
  const buffer = await readFile(FIXTURE_PATH);
  const filename = `sample-${randomUUID().slice(0, 8)}.jpg`;
  const response = await app.inject({
    method: "POST",
    url: "/admin/media",
    ...multipartUpload(buffer, filename, "image/jpeg", cookie),
  });
  assert.equal(response.statusCode, 302, response.body);

  const [row] = await db
    .select({ id: media.id })
    .from(media)
    .where(eq(media.filename, filename))
    .orderBy(desc(media.createdAt))
    .limit(1);
  assert.ok(row, "la imagen subida debe tener fila en media");
  return { id: row.id, filename };
}

async function createMinimalPost(app: App, cookie: string, spaceId: string): Promise<{ id: string; slug: string }> {
  const suffix = randomUUID().slice(0, 8);
  const slug = `post-s7-${suffix}`;
  const response = await app.inject({
    method: "POST",
    url: "/admin/posts",
    ...form({ spaceId, slug, title: `Post S7 ${suffix}`, excerpt: "" }, cookie),
  });
  assert.equal(response.statusCode, 302, response.body);
  const id = response.headers.location?.toString().split("/").pop();
  assert.ok(id);
  return { id, slug };
}

await ensureTestAdmin();

test("subir una imagen la lista en /admin/media", async () => {
  const app = await buildApp();
  const cookie = await login(app);

  const { filename } = await uploadFixture(app, cookie);

  const response = await app.inject({ method: "GET", url: "/admin/media", headers: { cookie } });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, new RegExp(filename));

  await app.close();
});

test("un archivo de MIME inválido se rechaza al subir", async () => {
  const app = await buildApp();
  const cookie = await login(app);

  const response = await app.inject({
    method: "POST",
    url: "/admin/media",
    ...multipartUpload(Buffer.from("no soy una imagen"), "archivo.txt", "text/plain", cookie),
  });
  assert.equal(response.statusCode, 400);

  await app.close();
});

test("un archivo que supera el tamaño máximo se rechaza al subir", async () => {
  const app = await buildApp();
  const cookie = await login(app);

  const oversized = Buffer.alloc(15 * 1024 * 1024 + 1024, 1);
  const response = await app.inject({
    method: "POST",
    url: "/admin/media",
    ...multipartUpload(oversized, "grande.jpg", "image/jpeg", cookie),
  });
  assert.equal(response.statusCode, 400);

  await app.close();
});

test("portada, cuerpo suelto y gallery traen srcset/width/height en el HTML público", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const [space] = await db
    .select({ id: spaces.id, subdomain: spaces.subdomain })
    .from(spaces)
    .where(eq(spaces.slug, "nutricion"))
    .limit(1);
  assert.ok(space);

  const { id: mediaId } = await uploadFixture(app, cookie);

  const { id: postId, slug } = await createMinimalPost(app, cookie, space.id);
  const bodyMd = [
    `![Una foto suelta](/media/${mediaId}.jpg)`,
    "",
    ':::gallery{cols="2"}',
    `![](/media/${mediaId}.jpg)`,
    ":::",
    "",
  ].join("\n");

  const saveResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${postId}`,
    ...form(
      { spaceId: space.id, slug, title: `Post S7 ${slug}`, excerpt: "", bodyMd, coverMediaId: mediaId },
      cookie,
    ),
  });
  assert.equal(saveResponse.statusCode, 302, saveResponse.body);

  const publishResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${postId}/publish`,
    headers: { cookie },
  });
  assert.equal(publishResponse.statusCode, 302, publishResponse.body);

  const response = await app.inject({
    method: "GET",
    url: `/${slug}`,
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(response.statusCode, 200);

  // Las tres formas de uso (portada, cuerpo suelto, gallery) resuelven al
  // mismo original de 700×400: tres srcset idénticos en el HTML público.
  const srcsetOccurrences = response.body.match(
    /srcset="\/media\/[\w-]+-320\.webp 320w, \/media\/[\w-]+-640\.webp 640w"/g,
  );
  assert.equal(srcsetOccurrences?.length, 3, "portada, cuerpo suelto y gallery deben traer srcset");
  assert.match(response.body, /width="700"/);
  assert.match(response.body, /height="400"/);
  assert.match(response.body, /loading="lazy"/);
  assert.match(response.body, /class="blueprint gallery__frame"/);
  assert.match(response.body, /class="post-panorama__photo"/);

  await app.close();
});

test("borrar una imagen en uso avisa dónde se usa y no rompe el post al confirmar", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const [space] = await db
    .select({ id: spaces.id, subdomain: spaces.subdomain })
    .from(spaces)
    .where(eq(spaces.slug, "nutricion"))
    .limit(1);
  assert.ok(space);

  const { id: mediaId } = await uploadFixture(app, cookie);
  const { id: postId, slug } = await createMinimalPost(app, cookie, space.id);

  const saveResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${postId}`,
    ...form(
      { spaceId: space.id, slug, title: `Post S7 ${slug}`, excerpt: "", bodyMd: "cuerpo mínimo", coverMediaId: mediaId },
      cookie,
    ),
  });
  assert.equal(saveResponse.statusCode, 302, saveResponse.body);

  const publishResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${postId}/publish`,
    headers: { cookie },
  });
  assert.equal(publishResponse.statusCode, 302, publishResponse.body);

  const confirmResponse = await app.inject({
    method: "GET",
    url: `/admin/media/${mediaId}/delete`,
    headers: { cookie },
  });
  assert.equal(confirmResponse.statusCode, 200);
  assert.match(confirmResponse.body, /portada del post/);

  const deleteResponse = await app.inject({
    method: "POST",
    url: `/admin/media/${mediaId}/delete`,
    headers: { cookie },
  });
  assert.equal(deleteResponse.statusCode, 302, deleteResponse.body);

  const publicResponse = await app.inject({
    method: "GET",
    url: `/${slug}`,
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(publicResponse.statusCode, 200);
  assert.doesNotMatch(publicResponse.body, /class="post-panorama__photo"/);

  await app.close();
});

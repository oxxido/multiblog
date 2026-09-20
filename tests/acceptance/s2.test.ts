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

const ADMIN_EMAIL = "s2-acceptance@example.com";
const ADMIN_PASSWORD = "s2-acceptance-password";

async function ensureTestAdmin(): Promise<void> {
  const passwordHash = hashPassword(ADMIN_PASSWORD);
  await db
    .insert(users)
    .values({ email: ADMIN_EMAIL, passwordHash })
    .onConflictDoUpdate({ target: users.email, set: { passwordHash } });
}

function form(
  fields: Record<string, string>,
  cookie?: string,
): { headers: Record<string, string>; payload: string } {
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (cookie) {
    headers["cookie"] = cookie;
  }
  return { headers, payload: new URLSearchParams(fields).toString() };
}

async function login(app: Awaited<ReturnType<typeof buildApp>>): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/admin/login",
    ...form({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  assert.equal(response.statusCode, 302);
  const sessionCookie = response.cookies.find((cookie) => cookie.name === "session");
  assert.ok(sessionCookie, "debe setear la cookie de sesión");
  return `session=${sessionCookie.value}`;
}

await ensureTestAdmin();

test("/admin sin cookie de sesión redirige a /admin/login", async () => {
  const app = await buildApp();
  const response = await app.inject({ method: "GET", url: "/admin" });
  assert.equal(response.statusCode, 302);
  assert.equal(response.headers.location, "/admin/login");
  await app.close();
});

test("login con credenciales incorrectas no crea sesión", async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/admin/login",
    ...form({ email: ADMIN_EMAIL, password: "contraseña-incorrecta" }),
  });
  assert.equal(response.statusCode, 302);
  assert.equal(response.headers.location, "/admin/login?error=1");
  await app.close();
});

test("flujo completo: login, crear post, borrador 404, publicar, cambiar slug con 301", async () => {
  const app = await buildApp();
  const cookie = await login(app);

  const [space] = await db.select({ id: spaces.id }).from(spaces).where(eq(spaces.slug, "nutricion")).limit(1);
  assert.ok(space, "el espacio nutricion debe estar sembrado");

  const slug = `post-de-prueba-${randomUUID().slice(0, 8)}`;
  const renamedSlug = `${slug}-renombrado`;

  const createResponse = await app.inject({
    method: "POST",
    url: "/admin/posts",
    ...form({ spaceId: space.id, slug, title: "Post de prueba S2", excerpt: "" }, cookie),
  });
  assert.equal(createResponse.statusCode, 302);
  const postId = createResponse.headers.location?.toString().split("/").pop();
  assert.ok(postId);

  // Paso mínimo de creación (S5): el cuerpo se escribe en la pantalla de
  // edición completa, no en el alta.
  const setBodyResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${postId}`,
    ...form(
      {
        spaceId: space.id,
        slug,
        title: "Post de prueba S2",
        excerpt: "",
        bodyMd: "# Hola\n\nContenido de prueba S2.",
      },
      cookie,
    ),
  });
  assert.equal(setBodyResponse.statusCode, 302);

  const draftResponse = await app.inject({
    method: "GET",
    url: `/${slug}`,
    headers: { host: "nutricion.localhost" },
  });
  assert.equal(draftResponse.statusCode, 404);

  const publishResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${postId}/publish`,
    headers: { cookie },
  });
  assert.equal(publishResponse.statusCode, 302);

  const publishedResponse = await app.inject({
    method: "GET",
    url: `/${slug}`,
    headers: { host: "nutricion.localhost" },
  });
  assert.equal(publishedResponse.statusCode, 200);
  assert.match(publishedResponse.body, /Contenido de prueba S2/);

  const updateResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${postId}`,
    ...form(
      {
        spaceId: space.id,
        slug: renamedSlug,
        title: "Post de prueba S2",
        excerpt: "",
        bodyMd: "# Hola\n\nContenido de prueba S2.",
      },
      cookie,
    ),
  });
  assert.equal(updateResponse.statusCode, 302);

  const oldSlugResponse = await app.inject({
    method: "GET",
    url: `/${slug}`,
    headers: { host: "nutricion.localhost" },
  });
  assert.equal(oldSlugResponse.statusCode, 301);
  assert.equal(oldSlugResponse.headers.location, `/${renamedSlug}`);

  const newSlugResponse = await app.inject({
    method: "GET",
    url: `/${renamedSlug}`,
    headers: { host: "nutricion.localhost" },
  });
  assert.equal(newSlugResponse.statusCode, 200);

  await app.close();
});

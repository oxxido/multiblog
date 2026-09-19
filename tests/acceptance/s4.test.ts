import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env.BASE_DOMAIN ??= "localhost";
process.env.DATABASE_URL ??= "postgres://multiblog:dev@localhost:5433/multiblog";

const { buildApp } = await import("../../src/app.js");
const { db, closeDb } = await import("../../src/db/client.js");
const { users, tags, postTags } = await import("../../src/db/schema.js");
const { hashPassword } = await import("../../src/modules/auth/password.js");

after(closeDb);

const ADMIN_EMAIL = "s4-acceptance@example.com";
const ADMIN_PASSWORD = "s4-acceptance-password";

async function ensureTestAdmin(): Promise<void> {
  const passwordHash = hashPassword(ADMIN_PASSWORD);
  await db
    .insert(users)
    .values({ email: ADMIN_EMAIL, passwordHash })
    .onConflictDoUpdate({ target: users.email, set: { passwordHash } });
}

function form(
  fields: Record<string, string | string[]>,
  cookie: string,
): { headers: Record<string, string>; payload: string } {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    for (const single of Array.isArray(value) ? value : [value]) {
      params.append(key, single);
    }
  }
  return {
    headers: { "content-type": "application/x-www-form-urlencoded", cookie },
    payload: params.toString(),
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

interface App {
  inject: Awaited<ReturnType<typeof buildApp>>["inject"];
}

async function createSpace(
  app: App,
  cookie: string,
  overrides: Partial<{ slug: string; subdomain: string; name: string; accentColor: string }> = {},
): Promise<{ id: string; subdomain: string }> {
  const suffix = randomUUID().slice(0, 8);
  const slug = overrides.slug ?? `espacio-s4-${suffix}`;
  const subdomain = overrides.subdomain ?? slug;
  const name = overrides.name ?? `Espacio S4 ${suffix}`;

  const response = await app.inject({
    method: "POST",
    url: "/admin/espacios",
    ...form(
      { slug, subdomain, name, description: "", accentColor: overrides.accentColor ?? "" },
      cookie,
    ),
  });
  assert.equal(response.statusCode, 302, response.body);
  const id = response.headers.location?.toString().split("/").pop();
  assert.ok(id);

  return { id, subdomain };
}

async function createPublishedPost(
  app: App,
  cookie: string,
  spaceId: string,
  overrides: Partial<{ slug: string; title: string; bodyMd: string; categoryIds: string[] }> = {},
): Promise<{ id: string; slug: string }> {
  const suffix = randomUUID().slice(0, 8);
  const slug = overrides.slug ?? `post-s4-${suffix}`;
  const title = overrides.title ?? `Post S4 ${suffix}`;

  const createResponse = await app.inject({
    method: "POST",
    url: "/admin/posts",
    ...form(
      {
        spaceId,
        slug,
        title,
        excerpt: "",
        bodyMd: overrides.bodyMd ?? `# ${title}\n\nCuerpo del post.`,
        ...(overrides.categoryIds ? { categoryIds: overrides.categoryIds } : {}),
      },
      cookie,
    ),
  });
  assert.equal(createResponse.statusCode, 302, createResponse.body);
  const id = createResponse.headers.location?.toString().split("/").pop();
  assert.ok(id);

  const publishResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${id}/publish`,
    headers: { cookie },
  });
  assert.equal(publishResponse.statusCode, 302);

  return { id, slug };
}

async function createCategory(app: App, cookie: string, spaceId: string, slug: string): Promise<{ id: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/admin/categorias",
    ...form({ spaceId, slug, name: slug, description: "" }, cookie),
  });
  assert.equal(response.statusCode, 302, response.body);
  const id = response.headers.location?.toString().split("/").pop();
  assert.ok(id);
  return { id };
}

async function tagPost(postId: string, slug: string, name: string): Promise<void> {
  const [tag] = await db
    .insert(tags)
    .values({ slug, name })
    .onConflictDoUpdate({ target: tags.slug, set: { name } })
    .returning({ id: tags.id });
  assert.ok(tag);
  await db.insert(postTags).values({ postId, tagId: tag.id }).onConflictDoNothing();
}

await ensureTestAdmin();

test("la home central sobre Host sin subdominio cuenta espacios activos y publicados, ignora archivados", async () => {
  const app = await buildApp();
  const cookie = await login(app);

  const active = await createSpace(app, cookie);
  await createPublishedPost(app, cookie, active.id);
  await createPublishedPost(app, cookie, active.id);

  const archived = await createSpace(app, cookie);
  await createPublishedPost(app, cookie, archived.id);
  const archiveResponse = await app.inject({
    method: "POST",
    url: `/admin/espacios/${archived.id}/archive`,
    headers: { cookie },
  });
  assert.equal(archiveResponse.statusCode, 302);

  const home = await app.inject({ method: "GET", url: "/", headers: { host: "localhost" } });
  assert.equal(home.statusCode, 200);
  assert.doesNotMatch(home.body, /<script/i);
  assert.doesNotMatch(home.body, new RegExp(archived.subdomain));

  await app.close();
});

test("un Host desconocido sigue devolviendo 404", async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: "GET",
    url: "/",
    headers: { host: "no-existe.localhost" },
  });
  assert.equal(response.statusCode, 404);

  await app.close();
});

test("'Último' cruza espacios distintos con el acento y el enlace correctos", async () => {
  const app = await buildApp();
  const cookie = await login(app);

  const spaceA = await createSpace(app, cookie, { accentColor: "#111111" });
  const spaceB = await createSpace(app, cookie, { accentColor: "#222222" });
  const postA = await createPublishedPost(app, cookie, spaceA.id);
  const postB = await createPublishedPost(app, cookie, spaceB.id);

  const home = await app.inject({ method: "GET", url: "/", headers: { host: "localhost" } });
  assert.equal(home.statusCode, 200);
  assert.match(home.body, new RegExp(`http://${spaceA.subdomain}\\.localhost/${postA.slug}`));
  assert.match(home.body, new RegExp(`http://${spaceB.subdomain}\\.localhost/${postB.slug}`));
  assert.match(home.body, /background: #111111/);
  assert.match(home.body, /background: #222222/);

  await app.close();
});

test("/c/{categoria} marca la categoría activa y una inexistente sigue en 404", async () => {
  const app = await buildApp();
  const cookie = await login(app);

  const space = await createSpace(app, cookie);
  const category = await createCategory(app, cookie, space.id, "evidencia");
  await createPublishedPost(app, cookie, space.id, { categoryIds: [category.id] });

  const categoryPage = await app.inject({
    method: "GET",
    url: "/c/evidencia",
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(categoryPage.statusCode, 200);
  assert.match(categoryPage.body, /category-bar__item is-active"\s*>evidencia/);

  const missing = await app.inject({
    method: "GET",
    url: "/c/no-existe",
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(missing.statusCode, 404);

  await app.close();
});

test("la página de post muestra categoría y minutos, navega al adyacente y no rompe sin categoría", async () => {
  const app = await buildApp();
  const cookie = await login(app);

  const space = await createSpace(app, cookie);
  const category = await createCategory(app, cookie, space.id, "cocina");

  const first = await createPublishedPost(app, cookie, space.id, {
    title: "Primero",
    categoryIds: [category.id],
  });
  const second = await createPublishedPost(app, cookie, space.id, { title: "Segundo sin categoría" });

  const firstPage = await app.inject({
    method: "GET",
    url: `/${first.slug}`,
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(firstPage.statusCode, 200);
  assert.match(firstPage.body, /cocina/);
  assert.match(firstPage.body, /\d+ min/);
  assert.match(firstPage.body, new RegExp(`href="/${second.slug}"`));
  assert.doesNotMatch(firstPage.body, /<script/i);

  const secondPage = await app.inject({
    method: "GET",
    url: `/${second.slug}`,
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(secondPage.statusCode, 200);
  assert.doesNotMatch(secondPage.body, /<script/i);

  await app.close();
});

test("los tags cruzan espacios en la home central", async () => {
  const app = await buildApp();
  const cookie = await login(app);

  const space = await createSpace(app, cookie);
  const post = await createPublishedPost(app, cookie, space.id);
  await tagPost(post.id, `experimentos-${randomUUID().slice(0, 8)}`, "Experimentos");

  const home = await app.inject({ method: "GET", url: "/", headers: { host: "localhost" } });
  assert.equal(home.statusCode, 200);
  assert.match(home.body, /Experimentos/);

  await app.close();
});

test("ninguna plantilla pública emite <script>", async () => {
  const app = await buildApp();
  const cookie = await login(app);

  const space = await createSpace(app, cookie);
  const post = await createPublishedPost(app, cookie, space.id);

  const central = await app.inject({ method: "GET", url: "/", headers: { host: "localhost" } });
  const spaceHome = await app.inject({ method: "GET", url: "/", headers: { host: `${space.subdomain}.localhost` } });
  const postPage = await app.inject({
    method: "GET",
    url: `/${post.slug}`,
    headers: { host: `${space.subdomain}.localhost` },
  });

  for (const response of [central, spaceHome, postPage]) {
    assert.equal(response.statusCode, 200);
    assert.doesNotMatch(response.body, /<script/i);
  }

  await app.close();
});

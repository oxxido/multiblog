import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

process.env.BASE_DOMAIN ??= "localhost";
process.env.DATABASE_URL ??= "postgres://multiblog:dev@localhost:5433/multiblog";

const { buildApp } = await import("../../src/app.js");
const { db, closeDb } = await import("../../src/db/client.js");
const { users } = await import("../../src/db/schema.js");
const { hashPassword } = await import("../../src/modules/auth/password.js");
const { slugifyTagName } = await import("../../src/modules/taxonomy/tags.js");

after(closeDb);

const ADMIN_EMAIL = "s9-acceptance@example.com";
const ADMIN_PASSWORD = "s9-acceptance-password";

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

async function createSpace(app: App, cookie: string): Promise<{ id: string; subdomain: string }> {
  const suffix = randomUUID().slice(0, 8);
  const slug = `espacio-s9-${suffix}`;
  const response = await app.inject({
    method: "POST",
    url: "/admin/espacios",
    ...form({ slug, subdomain: slug, name: `Espacio S9 ${suffix}`, description: "", accentColor: "" }, cookie),
  });
  assert.equal(response.statusCode, 302, response.body);
  const id = response.headers.location?.toString().split("/").pop();
  assert.ok(id);
  return { id, subdomain: slug };
}

async function createCategory(app: App, cookie: string, spaceId: string): Promise<{ slug: string }> {
  const slug = `cat-s9-${randomUUID().slice(0, 8)}`;
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
  overrides: Partial<{ slug: string; title: string; excerpt: string; bodyMd: string; tags: string; categoryIds: string }> = {},
): Promise<{ id: string; slug: string }> {
  const suffix = randomUUID().slice(0, 8);
  const slug = overrides.slug ?? `post-s9-${suffix}`;
  const title = overrides.title ?? `Post S9 ${suffix}`;

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
    ...form(
      {
        spaceId,
        slug,
        title,
        excerpt: overrides.excerpt ?? "",
        bodyMd: overrides.bodyMd ?? `# ${title}\n\nCuerpo del post.`,
        ...(overrides.tags !== undefined ? { tags: overrides.tags } : {}),
        ...(overrides.categoryIds !== undefined ? { categoryIds: overrides.categoryIds } : {}),
      },
      cookie,
    ),
  });
  assert.equal(editResponse.statusCode, 302, editResponse.body);

  return { id, slug };
}

async function publish(app: App, cookie: string, id: string): Promise<void> {
  const response = await app.inject({ method: "POST", url: `/admin/posts/${id}/publish`, headers: { cookie } });
  assert.equal(response.statusCode, 302);
}

await ensureTestAdmin();

test("un tag asignado por texto libre agrupa en /t/{tag} posts de espacios distintos", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const spaceA = await createSpace(app, cookie);
  const spaceB = await createSpace(app, cookie);

  const tagSuffix = randomUUID().slice(0, 8);
  const tagName = `Vida Sana ${tagSuffix}`;

  const postA = await createPost(app, cookie, spaceA.id, { tags: `${tagName}, otro tag` });
  await publish(app, cookie, postA.id);
  const postB = await createPost(app, cookie, spaceB.id, { tags: tagName });
  await publish(app, cookie, postB.id);

  const postPage = await app.inject({
    method: "GET",
    url: `/${postA.slug}`,
    headers: { host: `${spaceA.subdomain}.localhost` },
  });
  assert.equal(postPage.statusCode, 200);
  assert.match(postPage.body, new RegExp(`href="[^"]*/t/[a-z0-9-]+"[^>]*>${tagName}<`));

  const tagSlug = slugifyTagName(tagName);
  const tagPage = await app.inject({ method: "GET", url: `/t/${tagSlug}`, headers: { host: "localhost" } });
  assert.equal(tagPage.statusCode, 200);
  assert.match(tagPage.body, new RegExp(postA.slug));
  assert.match(tagPage.body, new RegExp(postB.slug));

  await app.close();
});

test("/espacios lista los espacios activos con su conteo de posts", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await createSpace(app, cookie);
  const post = await createPost(app, cookie, space.id);
  await publish(app, cookie, post.id);

  const response = await app.inject({ method: "GET", url: "/espacios", headers: { host: "localhost" } });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, new RegExp(`${space.subdomain}\\.localhost`));

  const enResponse = await app.inject({ method: "GET", url: "/en/espacios", headers: { host: "localhost" } });
  assert.equal(enResponse.statusCode, 200);

  await app.close();
});

test("/espacios dentro de un espacio da 404, no la página central", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await createSpace(app, cookie);

  const response = await app.inject({ method: "GET", url: "/espacios", headers: { host: `${space.subdomain}.localhost` } });
  assert.equal(response.statusCode, 404);

  await app.close();
});

test("un tag inexistente da 404 y un tag existente sin posts en un idioma da lista vacía", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await createSpace(app, cookie);

  const missing = await app.inject({ method: "GET", url: "/t/no-existe-este-tag", headers: { host: "localhost" } });
  assert.equal(missing.statusCode, 404);

  const tagSuffix = randomUUID().slice(0, 8);
  const post = await createPost(app, cookie, space.id, { tags: `Sin traducir ${tagSuffix}` });
  await publish(app, cookie, post.id);

  const tagSlug = slugifyTagName(`Sin traducir ${tagSuffix}`);
  const esPage = await app.inject({ method: "GET", url: `/t/${tagSlug}`, headers: { host: "localhost" } });
  assert.equal(esPage.statusCode, 200);
  assert.match(esPage.body, new RegExp(post.slug));

  const enPage = await app.inject({ method: "GET", url: `/en/t/${tagSlug}`, headers: { host: "localhost" } });
  assert.equal(enPage.statusCode, 200);
  assert.doesNotMatch(enPage.body, new RegExp(post.slug));

  await app.close();
});

test("/feed.xml de un espacio incluye sólo posts publicados con extracto y cuerpo completo", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await createSpace(app, cookie);

  const published = await createPost(app, cookie, space.id, {
    excerpt: "Un extracto",
    bodyMd: "Cuerpo **completo** del post.",
  });
  await publish(app, cookie, published.id);

  const draft = await createPost(app, cookie, space.id, { title: `Borrador sin publicar ${randomUUID().slice(0, 8)}` });

  const response = await app.inject({
    method: "GET",
    url: "/feed.xml",
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "application/rss+xml; charset=utf-8");
  assert.match(response.body, /<rss version="2.0"/);
  assert.match(response.body, /Un extracto/);
  assert.match(response.body, /Cuerpo <strong>completo<\/strong> del post\./);
  assert.doesNotMatch(response.body, new RegExp(draft.slug));

  await app.close();
});

test("/feed.xml agregado del central cruza espacios, en es y en en", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await createSpace(app, cookie);
  const post = await createPost(app, cookie, space.id, { excerpt: "Extracto agregado" });
  await publish(app, cookie, post.id);

  const esFeed = await app.inject({ method: "GET", url: "/feed.xml", headers: { host: "localhost" } });
  assert.equal(esFeed.statusCode, 200);
  assert.match(esFeed.body, new RegExp(post.slug));

  const enFeed = await app.inject({ method: "GET", url: "/en/feed.xml", headers: { host: "localhost" } });
  assert.equal(enFeed.statusCode, 200);
  assert.doesNotMatch(enFeed.body, new RegExp(post.slug));

  await app.close();
});

test("/sitemap.xml de un espacio lista posts publicados y categorías, no borradores", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await createSpace(app, cookie);
  const category = await createCategory(app, cookie, space.id);

  const published = await createPost(app, cookie, space.id);
  await publish(app, cookie, published.id);
  const draft = await createPost(app, cookie, space.id, { title: `Borrador sitemap ${randomUUID().slice(0, 8)}` });

  const response = await app.inject({
    method: "GET",
    url: "/sitemap.xml",
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["content-type"], "application/xml; charset=utf-8");
  assert.match(response.body, /<urlset/);
  assert.match(response.body, new RegExp(published.slug));
  assert.match(response.body, new RegExp(`/c/${category.slug}`));
  assert.doesNotMatch(response.body, new RegExp(draft.slug));

  await app.close();
});

test("/sitemap.xml central es un índice que apunta al de cada espacio activo, en su mismo idioma", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await createSpace(app, cookie);

  const response = await app.inject({ method: "GET", url: "/sitemap.xml", headers: { host: "localhost" } });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, /<sitemapindex/);
  assert.doesNotMatch(response.body, /<urlset/);
  assert.doesNotMatch(response.body, /<url>/);
  assert.match(response.body, new RegExp(`http://${space.subdomain}\\.localhost/sitemap\\.xml`));

  const enResponse = await app.inject({ method: "GET", url: "/en/sitemap.xml", headers: { host: "localhost" } });
  assert.equal(enResponse.statusCode, 200);
  assert.match(enResponse.body, new RegExp(`http://${space.subdomain}\\.localhost/en/sitemap\\.xml`));

  await app.close();
});

test("canonical de un post apunta a su subdominio, no al central", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await createSpace(app, cookie);
  const post = await createPost(app, cookie, space.id);
  await publish(app, cookie, post.id);

  const response = await app.inject({
    method: "GET",
    url: `/${post.slug}`,
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(response.statusCode, 200);
  assert.match(response.body, new RegExp(`rel="canonical" href="http://${space.subdomain}\\.localhost/${post.slug}"`));
  assert.doesNotMatch(response.body, /rel="canonical" href="http:\/\/localhost/);

  await app.close();
});

test("post, espacio y central llevan Open Graph con image cuando hay portada", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await createSpace(app, cookie);
  const post = await createPost(app, cookie, space.id, { excerpt: "Extracto OG" });
  await publish(app, cookie, post.id);

  const postResponse = await app.inject({
    method: "GET",
    url: `/${post.slug}`,
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.match(postResponse.body, /<meta property="og:type" content="article" \/>/);
  assert.match(postResponse.body, /<meta property="og:description" content="Extracto OG" \/>/);
  assert.doesNotMatch(postResponse.body, /og:image/);

  const spaceResponse = await app.inject({ method: "GET", url: "/", headers: { host: `${space.subdomain}.localhost` } });
  assert.match(spaceResponse.body, /<meta property="og:type" content="website" \/>/);

  const centralResponse = await app.inject({ method: "GET", url: "/", headers: { host: "localhost" } });
  assert.match(centralResponse.body, /<meta property="og:type" content="website" \/>/);

  await app.close();
});

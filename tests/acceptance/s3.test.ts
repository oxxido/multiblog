import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

process.env.BASE_DOMAIN ??= "localhost";
process.env.DATABASE_URL ??= "postgres://multiblog:dev@localhost:5433/multiblog";

const { buildApp } = await import("../../src/app.js");
const { db, closeDb } = await import("../../src/db/client.js");
const { posts, users } = await import("../../src/db/schema.js");
const { hashPassword } = await import("../../src/modules/auth/password.js");

after(closeDb);

const ADMIN_EMAIL = "s3-acceptance@example.com";
const ADMIN_PASSWORD = "s3-acceptance-password";

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
  overrides: Partial<{ slug: string; subdomain: string; name: string }> = {},
): Promise<{ id: string; subdomain: string }> {
  const suffix = randomUUID().slice(0, 8);
  const slug = overrides.slug ?? `espacio-s3-${suffix}`;
  const subdomain = overrides.subdomain ?? slug;
  const name = overrides.name ?? `Espacio S3 ${suffix}`;

  const response = await app.inject({
    method: "POST",
    url: "/admin/espacios",
    ...form({ slug, subdomain, name, description: "", accentColor: "" }, cookie),
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
  const slug = overrides.slug ?? `post-s3-${suffix}`;
  const title = overrides.title ?? `Post S3 ${suffix}`;

  const createResponse = await app.inject({
    method: "POST",
    url: "/admin/posts",
    ...form(
      {
        spaceId,
        slug,
        title,
        excerpt: "",
        bodyMd: overrides.bodyMd ?? `# ${title}`,
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

async function createCategory(
  app: App,
  cookie: string,
  spaceId: string,
  slug: string,
): Promise<{ id: string }> {
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

await ensureTestAdmin();

test("crear un espacio nuevo desde el admin responde en su subdominio sin redeploy", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const { subdomain } = await createSpace(app, cookie);

  const response = await app.inject({ method: "GET", url: "/", headers: { host: `${subdomain}.localhost` } });
  assert.equal(response.statusCode, 200);

  await app.close();
});

test("un post de un espacio nunca aparece en el índice de otro", async () => {
  const app = await buildApp();
  const cookie = await login(app);

  const spaceA = await createSpace(app, cookie);
  const spaceB = await createSpace(app, cookie);
  const postA = await createPublishedPost(app, cookie, spaceA.id);
  const postB = await createPublishedPost(app, cookie, spaceB.id);

  const indexA = await app.inject({ method: "GET", url: "/", headers: { host: `${spaceA.subdomain}.localhost` } });
  assert.match(indexA.body, new RegExp(postA.slug));
  assert.doesNotMatch(indexA.body, new RegExp(postB.slug));

  const indexB = await app.inject({ method: "GET", url: "/", headers: { host: `${spaceB.subdomain}.localhost` } });
  assert.match(indexB.body, new RegExp(postB.slug));
  assert.doesNotMatch(indexB.body, new RegExp(postA.slug));

  await app.close();
});

test("archivar un espacio da 404 en su subdominio, con el contenido intacto en la base", async () => {
  const app = await buildApp();
  const cookie = await login(app);

  const space = await createSpace(app, cookie);
  const post = await createPublishedPost(app, cookie, space.id);

  const beforeArchive = await app.inject({
    method: "GET",
    url: "/",
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(beforeArchive.statusCode, 200);

  const archiveResponse = await app.inject({
    method: "POST",
    url: `/admin/espacios/${space.id}/archive`,
    headers: { cookie },
  });
  assert.equal(archiveResponse.statusCode, 302);

  const afterArchive = await app.inject({
    method: "GET",
    url: "/",
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(afterArchive.statusCode, 404);

  const [row] = await db.select({ slug: posts.slug }).from(posts).where(eq(posts.slug, post.slug)).limit(1);
  assert.ok(row, "el post del espacio archivado sigue en la tabla posts");

  await app.close();
});

test("una categoría agrupa posts sólo dentro de su espacio", async () => {
  const app = await buildApp();
  const cookie = await login(app);

  const spaceD = await createSpace(app, cookie);
  const spaceE = await createSpace(app, cookie);
  const categoryD = await createCategory(app, cookie, spaceD.id, "destacados");
  await createCategory(app, cookie, spaceE.id, "destacados");

  const post = await createPublishedPost(app, cookie, spaceD.id, { categoryIds: [categoryD.id] });

  const categoryIndexD = await app.inject({
    method: "GET",
    url: "/c/destacados",
    headers: { host: `${spaceD.subdomain}.localhost` },
  });
  assert.equal(categoryIndexD.statusCode, 200);
  assert.match(categoryIndexD.body, new RegExp(post.slug));

  const categoryIndexE = await app.inject({
    method: "GET",
    url: "/c/destacados",
    headers: { host: `${spaceE.subdomain}.localhost` },
  });
  assert.equal(categoryIndexE.statusCode, 200);
  assert.doesNotMatch(categoryIndexE.body, new RegExp(post.slug));

  const missingCategory = await app.inject({
    method: "GET",
    url: "/c/no-existe",
    headers: { host: `${spaceD.subdomain}.localhost` },
  });
  assert.equal(missingCategory.statusCode, 404);

  await app.close();
});

test("el índice de espacio pagina sin repetir ni omitir posts", async () => {
  const app = await buildApp();
  const cookie = await login(app);

  const space = await createSpace(app, cookie);
  const slugs: string[] = [];
  for (let i = 0; i < 13; i += 1) {
    const { slug } = await createPublishedPost(app, cookie, space.id);
    slugs.push(slug);
  }

  const page1 = await app.inject({
    method: "GET",
    url: "/?page=1",
    headers: { host: `${space.subdomain}.localhost` },
  });
  const page2 = await app.inject({
    method: "GET",
    url: "/?page=2",
    headers: { host: `${space.subdomain}.localhost` },
  });

  const slugsInPage1 = slugs.filter((slug) => page1.body.includes(slug));
  const slugsInPage2 = slugs.filter((slug) => page2.body.includes(slug));

  assert.equal(slugsInPage1.length, 10);
  assert.equal(slugsInPage2.length, 3);
  assert.deepEqual(
    new Set([...slugsInPage1, ...slugsInPage2]),
    new Set(slugs),
    "la unión de ambas páginas debe cubrir todos los posts, sin repetidos",
  );

  await app.close();
});

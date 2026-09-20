import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

process.env.BASE_DOMAIN ??= "localhost";
process.env.DATABASE_URL ??= "postgres://multiblog:dev@localhost:5433/multiblog";
process.env.OPENROUTER_API_KEY ??= "sk-test-not-a-real-key";

const { buildApp } = await import("../../src/app.js");
const { db, closeDb } = await import("../../src/db/client.js");
const { posts, spaces, users } = await import("../../src/db/schema.js");
const { hashPassword } = await import("../../src/modules/auth/password.js");
const { createCategory } = await import("../../src/modules/taxonomy/categories.js");

after(closeDb);

const ADMIN_EMAIL = "s8-acceptance@example.com";
const ADMIN_PASSWORD = "s8-acceptance-password";

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
  const slug = `post-s8-${suffix}`;
  const response = await app.inject({
    method: "POST",
    url: "/admin/posts",
    ...form({ spaceId, slug, title: `Post S8 ${suffix}`, excerpt: "Extracto original" }, cookie),
  });
  assert.equal(response.statusCode, 302, response.body);
  const id = response.headers.location?.toString().split("/").pop();
  assert.ok(id);
  return { id, slug };
}

async function publishWithBody(
  app: App,
  cookie: string,
  spaceId: string,
  bodyMd: string,
): Promise<{ id: string; slug: string }> {
  const { id, slug } = await createMinimalPost(app, cookie, spaceId);
  const saveResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${id}`,
    ...form({ spaceId, slug, title: `Post S8 ${slug}`, excerpt: "Extracto original", bodyMd }, cookie),
  });
  assert.equal(saveResponse.statusCode, 302, saveResponse.body);
  const publishResponse = await app.inject({ method: "POST", url: `/admin/posts/${id}/publish`, headers: { cookie } });
  assert.equal(publishResponse.statusCode, 302, publishResponse.body);
  return { id, slug };
}

function chatCompletionResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: "openrouter/auto",
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

const SAMPLE_BODY_MD = [
  "Un párrafo cualquiera.",
  "",
  "```js",
  "const x = 1;",
  "```",
  "",
  ':::gallery{cols="2"}',
  "![Una foto](https://example.com/a.jpg)",
  "![Otra foto](https://example.com/b.jpg)",
  ":::",
  "",
].join("\n");

const TRANSLATED_BODY_MD_OK = [
  "Just a paragraph.",
  "",
  "```js",
  "const x = 1;",
  "```",
  "",
  ':::gallery{cols="2"}',
  "![A photo](https://example.com/a.jpg)",
  "![Another photo](https://example.com/b.jpg)",
  ":::",
  "",
].join("\n");

const TRANSLATED_BODY_MD_MISSING_DIRECTIVE = ["Just a paragraph.", "", "```js", "const x = 1;", "```", ""].join("\n");

await ensureTestAdmin();

async function getSpace(slug: "nutricion" | "ideas"): Promise<{ id: string; subdomain: string }> {
  const [space] = await db
    .select({ id: spaces.id, subdomain: spaces.subdomain })
    .from(spaces)
    .where(eq(spaces.slug, slug))
    .limit(1);
  assert.ok(space);
  return space;
}

test("traducir un post publicado preserva la estructura de bloques y crea un borrador en inglés", async (t) => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await getSpace("nutricion");

  const original = await publishWithBody(app, cookie, space.id, SAMPLE_BODY_MD);

  t.mock.method(globalThis, "fetch", () =>
    chatCompletionResponse(
      JSON.stringify({
        title: "Translated title",
        excerpt: "Translated excerpt",
        slug: "translated-slug",
        bodyMd: TRANSLATED_BODY_MD_OK,
      }),
    ),
  );

  const translateResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${original.id}/translate`,
    headers: { cookie },
  });
  assert.equal(translateResponse.statusCode, 302, translateResponse.body);
  const translatedId = translateResponse.headers.location?.toString().split("/").pop();
  assert.ok(translatedId);

  const [translatedRow] = await db
    .select({ slug: posts.slug, status: posts.status, lang: posts.lang, bodyMd: posts.bodyMd })
    .from(posts)
    .where(eq(posts.id, translatedId))
    .limit(1);
  assert.ok(translatedRow);
  assert.equal(translatedRow.lang, "en");
  assert.equal(translatedRow.status, "draft");
  assert.equal(translatedRow.bodyMd, TRANSLATED_BODY_MD_OK);

  const draftResponse = await app.inject({
    method: "GET",
    url: `/en/${translatedRow.slug}`,
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(draftResponse.statusCode, 404);

  await app.inject({ method: "POST", url: `/admin/posts/${translatedId}/publish`, headers: { cookie } });

  const publishedResponse = await app.inject({
    method: "GET",
    url: `/en/${translatedRow.slug}`,
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(publishedResponse.statusCode, 200);
  assert.match(publishedResponse.body, /Just a paragraph\./);

  await app.close();
});

test("una traducción con una directiva de menos se rechaza y no se guarda ninguna fila", async (t) => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await getSpace("nutricion");

  const original = await publishWithBody(app, cookie, space.id, SAMPLE_BODY_MD);

  t.mock.method(globalThis, "fetch", () =>
    chatCompletionResponse(
      JSON.stringify({
        title: "Translated title",
        excerpt: "Translated excerpt",
        slug: "translated-slug",
        bodyMd: TRANSLATED_BODY_MD_MISSING_DIRECTIVE,
      }),
    ),
  );

  const translateResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${original.id}/translate`,
    headers: { cookie },
  });
  assert.equal(translateResponse.statusCode, 302);
  assert.match(translateResponse.headers.location?.toString() ?? "", /translateError=/);

  const siblings = await db.select({ id: posts.id }).from(posts).where(eq(posts.sourcePostId, original.id));
  assert.equal(siblings.length, 0);

  await app.close();
});

test("editar el original tras traducir marca la traducción como desactualizada en el admin", async (t) => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await getSpace("nutricion");

  const original = await publishWithBody(app, cookie, space.id, SAMPLE_BODY_MD);

  t.mock.method(globalThis, "fetch", () =>
    chatCompletionResponse(
      JSON.stringify({
        title: "Stale check title",
        excerpt: "Translated excerpt",
        slug: `stale-check-${randomUUID().slice(0, 8)}`,
        bodyMd: TRANSLATED_BODY_MD_OK,
      }),
    ),
  );

  const translateResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${original.id}/translate`,
    headers: { cookie },
  });
  assert.equal(translateResponse.statusCode, 302, translateResponse.body);

  // El save del original tiene que llegar estrictamente después de
  // translatedAt para que la comparación de marcas de tiempo sea inequívoca.
  await new Promise((resolve) => setTimeout(resolve, 20));

  const editResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${original.id}`,
    ...form(
      {
        spaceId: space.id,
        slug: original.slug,
        title: `Post S8 ${original.slug} editado`,
        excerpt: "Extracto original",
        bodyMd: SAMPLE_BODY_MD,
      },
      cookie,
    ),
  });
  assert.equal(editResponse.statusCode, 302, editResponse.body);

  const listResponse = await app.inject({ method: "GET", url: "/admin/posts", headers: { cookie } });
  assert.equal(listResponse.statusCode, 200);
  assert.match(listResponse.body, /Stale check title[\s\S]*\(traducción desactualizada\)/);

  await app.close();
});

test("/en/ y /en/{slug} resuelven sobre un espacio y sobre el dominio central", async (t) => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await getSpace("ideas");

  const original = await publishWithBody(app, cookie, space.id, SAMPLE_BODY_MD);

  t.mock.method(globalThis, "fetch", () =>
    chatCompletionResponse(
      JSON.stringify({
        title: "En route check",
        excerpt: "Translated excerpt",
        slug: `en-route-check-${randomUUID().slice(0, 8)}`,
        bodyMd: TRANSLATED_BODY_MD_OK,
      }),
    ),
  );

  const translateResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${original.id}/translate`,
    headers: { cookie },
  });
  assert.equal(translateResponse.statusCode, 302, translateResponse.body);
  const translatedId = translateResponse.headers.location?.toString().split("/").pop();
  assert.ok(translatedId);
  await app.inject({ method: "POST", url: `/admin/posts/${translatedId}/publish`, headers: { cookie } });

  const [translatedRow] = await db.select({ slug: posts.slug }).from(posts).where(eq(posts.id, translatedId)).limit(1);
  assert.ok(translatedRow);

  const spaceIndex = await app.inject({ method: "GET", url: "/en/", headers: { host: `${space.subdomain}.localhost` } });
  assert.equal(spaceIndex.statusCode, 200);

  const postPage = await app.inject({
    method: "GET",
    url: `/en/${translatedRow.slug}`,
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(postPage.statusCode, 200);

  const centralIndex = await app.inject({ method: "GET", url: "/en/", headers: { host: "localhost" } });
  assert.equal(centralIndex.statusCode, 200);

  await app.close();
});

test("un post sin traducir no aparece en el índice del espacio en /en/ ni en la home central en inglés", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await getSpace("ideas");

  const untranslatedTitle = `Sin traducir ${randomUUID().slice(0, 8)}`;
  const { id, slug } = await createMinimalPost(app, cookie, space.id);
  await app.inject({
    method: "POST",
    url: `/admin/posts/${id}`,
    ...form({ spaceId: space.id, slug, title: untranslatedTitle, excerpt: "", bodyMd: SAMPLE_BODY_MD }, cookie),
  });
  await app.inject({ method: "POST", url: `/admin/posts/${id}/publish`, headers: { cookie } });

  const spaceIndex = await app.inject({ method: "GET", url: "/en/", headers: { host: `${space.subdomain}.localhost` } });
  assert.equal(spaceIndex.statusCode, 200);
  assert.doesNotMatch(spaceIndex.body, new RegExp(untranslatedTitle));

  const centralIndex = await app.inject({ method: "GET", url: "/en/", headers: { host: "localhost" } });
  assert.equal(centralIndex.statusCode, 200);
  assert.doesNotMatch(centralIndex.body, new RegExp(untranslatedTitle));

  await app.close();
});

test("post con ambas versiones publicadas tiene hreflang recíproco y x-default en las dos páginas", async (t) => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await getSpace("nutricion");

  const original = await publishWithBody(app, cookie, space.id, SAMPLE_BODY_MD);
  const translatedSlug = `hreflang-check-${randomUUID().slice(0, 8)}`;

  t.mock.method(globalThis, "fetch", () =>
    chatCompletionResponse(
      JSON.stringify({
        title: "Hreflang check",
        excerpt: "Translated excerpt",
        slug: translatedSlug,
        bodyMd: TRANSLATED_BODY_MD_OK,
      }),
    ),
  );

  const translateResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${original.id}/translate`,
    headers: { cookie },
  });
  const translatedId = translateResponse.headers.location?.toString().split("/").pop();
  assert.ok(translatedId);
  await app.inject({ method: "POST", url: `/admin/posts/${translatedId}/publish`, headers: { cookie } });

  const host = `${space.subdomain}.localhost`;
  const esUrl = `http://${host}/${original.slug}`;
  const enUrl = `http://${host}/en/${translatedSlug}`;

  const esPage = await app.inject({ method: "GET", url: `/${original.slug}`, headers: { host } });
  assert.equal(esPage.statusCode, 200);
  assert.match(esPage.body, new RegExp(`rel="canonical" href="${esUrl}"`));
  assert.match(esPage.body, new RegExp(`rel="alternate" hreflang="en" href="${enUrl}"`));
  assert.match(esPage.body, new RegExp(`rel="alternate" hreflang="x-default" href="${esUrl}"`));

  const enPage = await app.inject({ method: "GET", url: `/en/${translatedSlug}`, headers: { host } });
  assert.equal(enPage.statusCode, 200);
  assert.match(enPage.body, new RegExp(`rel="canonical" href="${enUrl}"`));
  assert.match(enPage.body, new RegExp(`rel="alternate" hreflang="es" href="${esUrl}"`));
  assert.match(enPage.body, new RegExp(`rel="alternate" hreflang="x-default" href="${esUrl}"`));

  await app.close();
});

test("/en/c/{categoria} resuelve sobre un espacio", async (t) => {
  const app = await buildApp();
  const cookie = await login(app);
  const space = await getSpace("ideas");

  const categorySuffix = randomUUID().slice(0, 8);
  const categorySlug = `cat-s8-${categorySuffix}`;
  const { id: categoryId } = await createCategory(space.id, {
    slug: categorySlug,
    name: `Categoría S8 ${categorySuffix}`,
    description: null,
  });

  const original = await publishWithBody(app, cookie, space.id, SAMPLE_BODY_MD);

  t.mock.method(globalThis, "fetch", () =>
    chatCompletionResponse(
      JSON.stringify({
        title: "Category route check",
        excerpt: "Translated excerpt",
        slug: `category-route-check-${randomUUID().slice(0, 8)}`,
        bodyMd: TRANSLATED_BODY_MD_OK,
      }),
    ),
  );

  const translateResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${original.id}/translate`,
    headers: { cookie },
  });
  const translatedId = translateResponse.headers.location?.toString().split("/").pop();
  assert.ok(translatedId);

  const [translatedRow] = await db
    .select({ slug: posts.slug, title: posts.title, bodyMd: posts.bodyMd })
    .from(posts)
    .where(eq(posts.id, translatedId))
    .limit(1);
  assert.ok(translatedRow);

  const assignCategoryResponse = await app.inject({
    method: "POST",
    url: `/admin/posts/${translatedId}`,
    ...form(
      {
        spaceId: space.id,
        slug: translatedRow.slug,
        title: translatedRow.title,
        excerpt: "",
        bodyMd: translatedRow.bodyMd,
        categoryIds: categoryId,
      },
      cookie,
    ),
  });
  assert.equal(assignCategoryResponse.statusCode, 302, assignCategoryResponse.body);
  await app.inject({ method: "POST", url: `/admin/posts/${translatedId}/publish`, headers: { cookie } });

  const categoryPage = await app.inject({
    method: "GET",
    url: `/en/c/${categorySlug}`,
    headers: { host: `${space.subdomain}.localhost` },
  });
  assert.equal(categoryPage.statusCode, 200);
  assert.match(categoryPage.body, /Category route check/);

  await app.close();
});

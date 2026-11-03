import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

process.env.BASE_DOMAIN ??= "localhost";
process.env.DATABASE_URL ??= "postgres://multiblog:dev@localhost:5433/multiblog";
process.env.OPENROUTER_API_KEY ??= "sk-test-not-a-real-key";

const { buildApp } = await import("../../src/app.js");
const { db, closeDb } = await import("../../src/db/client.js");
const { deleteSpacesByPrefix } = await import("../helpers/cleanup.js");
const { media, postCategories, postSlugs, postTags, posts, users } = await import("../../src/db/schema.js");
const { updatePost } = await import("../../src/modules/content/posts.js");
const { hashPassword } = await import("../../src/modules/auth/password.js");

const mediaIds: string[] = [];

after(async () => {
  await deleteSpacesByPrefix(db, "espacio-guardado-");
  for (const id of mediaIds) {
    await db.delete(media).where(eq(media.id, id));
  }
  await closeDb();
});

const ADMIN_EMAIL = "s11-guardado@example.com";
const ADMIN_PASSWORD = "s11-guardado-password";

function form(fields: Record<string, string | string[]>, cookie: string): { headers: Record<string, string>; payload: string } {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) {
      params.append(key, item);
    }
  }
  return { headers: { "content-type": "application/x-www-form-urlencoded", cookie }, payload: params.toString() };
}

type App = Awaited<ReturnType<typeof buildApp>>;

async function login(app: App): Promise<string> {
  const passwordHash = hashPassword(ADMIN_PASSWORD);
  await db.insert(users).values({ email: ADMIN_EMAIL, passwordHash }).onConflictDoUpdate({ target: users.email, set: { passwordHash } });
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

async function createSpaceAndPost(app: App, cookie: string): Promise<{ spaceId: string; postId: string; slug: string; title: string }> {
  const suffix = randomUUID().slice(0, 8);
  const spaceSlug = `espacio-guardado-${suffix}`;
  const spaceResponse = await app.inject({
    method: "POST",
    url: "/admin/espacios",
    ...form({ slug: spaceSlug, subdomain: spaceSlug, name: `Espacio ${suffix}`, description: "", accentColor: "" }, cookie),
  });
  const spaceId = spaceResponse.headers.location?.toString().split("/").pop();
  assert.ok(spaceId);

  const slug = `post-${suffix}`;
  const title = `Post ${suffix}`;
  const postResponse = await app.inject({ method: "POST", url: "/admin/posts", ...form({ spaceId, slug, title, excerpt: "" }, cookie) });
  const postId = postResponse.headers.location?.toString().split("/").pop();
  assert.ok(postId);
  return { spaceId, postId, slug, title };
}

test("elegir otra portada y guardar la persiste, y el input de portada queda asociado al formulario", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const { spaceId, postId, slug, title } = await createSpaceAndPost(app, cookie);

  const [row] = await db
    .insert(media)
    .values({ filename: "portada.jpg", path: "x.jpg", mime: "image/jpeg", width: 800, height: 600, size: 10 })
    .returning({ id: media.id });
  assert.ok(row);
  mediaIds.push(row.id);

  const save = await app.inject({
    method: "POST",
    url: `/admin/posts/${postId}`,
    ...form({ spaceId, slug, title, excerpt: "", bodyMd: "Cuerpo.", coverMediaId: row.id }, cookie),
  });
  assert.equal(save.statusCode, 302, save.body);

  const [saved] = await db.select({ coverMediaId: posts.coverMediaId }).from(posts).where(eq(posts.id, postId));
  assert.equal(saved?.coverMediaId, row.id);

  const page = await app.inject({ method: "GET", url: `/admin/posts/${postId}`, headers: { cookie } });
  assert.equal(page.statusCode, 200);
  assert.match(page.body, /name="coverMediaId"[^>]*\sform="post-form"/);

  await app.close();
});

test("guardar con el cuerpo vacío no se rechaza: un borrador recién creado todavía no tiene texto", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const { spaceId, postId, slug } = await createSpaceAndPost(app, cookie);

  const save = await app.inject({
    method: "POST",
    url: `/admin/posts/${postId}`,
    ...form({ spaceId, slug, title: "Sólo título", excerpt: "", bodyMd: "" }, cookie),
  });
  assert.equal(save.statusCode, 302, save.body);

  await app.close();
});

test("la página de edición no marca el textarea oculto como obligatorio (bloqueaba Guardar sin avisar)", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const { postId } = await createSpaceAndPost(app, cookie);

  const page = await app.inject({ method: "GET", url: `/admin/posts/${postId}`, headers: { cookie } });
  const textareaTag = /<textarea[^>]*name="bodyMd"[^>]*>/.exec(page.body)?.[0];
  assert.ok(textareaTag);
  assert.doesNotMatch(textareaTag, /required/);

  await app.close();
});

async function createCategory(app: App, cookie: string, spaceId: string): Promise<string> {
  const slug = `cat-${randomUUID().slice(0, 8)}`;
  const response = await app.inject({
    method: "POST",
    url: "/admin/categorias",
    ...form({ spaceId, slug, name: slug, description: "" }, cookie),
  });
  assert.equal(response.statusCode, 302, response.body);
  const { categories } = await import("../../src/db/schema.js");
  const [row] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, slug));
  assert.ok(row);
  return row.id;
}

// Los tests de arriba arman el POST a mano, así que no prueban lo que el
// navegador realmente envía. Este recorre el HTML renderizado: cada campo que
// el servidor espera tiene que existir dentro del formulario o estar asociado
// a él con form="post-form". Un campo huérfano llega vacío y el guardado lo
// interpreta como "borrar".
test("todos los campos que espera el servidor están asociados al formulario del post", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const { spaceId, postId } = await createSpaceAndPost(app, cookie);
  await createCategory(app, cookie, spaceId);

  const page = await app.inject({ method: "GET", url: `/admin/posts/${postId}`, headers: { cookie } });
  const start = page.body.indexOf('<form id="post-form"');
  const end = page.body.indexOf("</form>", start);
  assert.ok(start >= 0 && end > start, "no se encontró el formulario del post");
  const inside = page.body.slice(start, end);

  for (const name of ["spaceId", "slug", "title", "excerpt", "bodyMd", "categoryIds", "tags", "coverMediaId"]) {
    const isInside = new RegExp(`name="${name}"`).test(inside);
    const isAssociated = new RegExp(`<[^>]*name="${name}"[^>]*\\sform="post-form"`).test(page.body);
    assert.ok(isInside || isAssociated, `el campo ${name} no viaja con el formulario del post`);
  }

  await app.close();
});

test("guardar con tags y categorías los persiste y se ven al reabrir el post", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const { spaceId, postId, slug, title } = await createSpaceAndPost(app, cookie);
  const categoryId = await createCategory(app, cookie, spaceId);

  const save = await app.inject({
    method: "POST",
    url: `/admin/posts/${postId}`,
    ...form({ spaceId, slug, title, excerpt: "", bodyMd: "Cuerpo.", tags: "uno, dos", categoryIds: [categoryId] }, cookie),
  });
  assert.equal(save.statusCode, 302, save.body);

  const page = await app.inject({ method: "GET", url: `/admin/posts/${postId}`, headers: { cookie } });
  assert.match(page.body, /name="tags"[^>]*value="uno, dos"/);
  assert.match(page.body, new RegExp(`value="${categoryId}"[^>]*checked`));

  await app.close();
});

test("un guardado que falla no deja rastros: ni historial de slug ni tags borrados", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const { spaceId, postId, slug, title } = await createSpaceAndPost(app, cookie);
  const other = await createSpaceAndPost(app, cookie);

  await app.inject({
    method: "POST",
    url: `/admin/posts/${postId}`,
    ...form({ spaceId, slug, title, excerpt: "", bodyMd: "Cuerpo.", tags: "uno, dos" }, cookie),
  });
  await app.inject({ method: "POST", url: `/admin/posts/${postId}/publish`, headers: { cookie } });

  // Mismo espacio que el otro post para provocar la colisión de slug.
  await db.update(posts).set({ spaceId }).where(eq(posts.id, other.postId));
  await assert.rejects(
    updatePost(postId, {
      spaceId,
      slug: other.slug,
      title,
      excerpt: null,
      bodyMd: "Cuerpo.",
      categoryIds: [],
      tagNames: [],
      coverMediaId: null,
    }),
  );

  const history = await db.select({ id: postSlugs.postId }).from(postSlugs).where(eq(postSlugs.postId, postId));
  assert.equal(history.length, 0, "el slug viejo no debe quedar en el historial si el cambio no ocurrió");
  const tagRows = await db.select({ tagId: postTags.tagId }).from(postTags).where(eq(postTags.postId, postId));
  assert.equal(tagRows.length, 2, "los tags no deben borrarse");

  await app.close();
});

test("'Publicar ahora' desde el editor redirige a la publicación en el sitio público", async () => {
  const app = await buildApp();
  const cookie = await login(app);
  const { spaceId, postId, slug, title } = await createSpaceAndPost(app, cookie);
  await app.inject({
    method: "POST",
    url: `/admin/posts/${postId}`,
    ...form({ spaceId, slug, title, excerpt: "", bodyMd: "Cuerpo." }, cookie),
  });

  const publish = await app.inject({ method: "POST", url: `/admin/posts/${postId}/publish`, ...form({ back: "public" }, cookie) });
  assert.equal(publish.statusCode, 302, publish.body);
  assert.match(publish.headers.location?.toString() ?? "", new RegExp(`^http://espacio-guardado-[a-z0-9]+\\.localhost(:\\d+)?/${slug}$`));

  await app.close();
});

test("traducir un post copia tags, categorías y portada a la traducción nueva", async (t) => {
  const app = await buildApp();
  const cookie = await login(app);
  const { spaceId, postId, slug, title } = await createSpaceAndPost(app, cookie);
  const categoryId = await createCategory(app, cookie, spaceId);
  const [cover] = await db
    .insert(media)
    .values({ filename: "c.jpg", path: "c.jpg", mime: "image/jpeg", width: 800, height: 600, size: 10 })
    .returning({ id: media.id });
  assert.ok(cover);
  mediaIds.push(cover.id);

  await app.inject({
    method: "POST",
    url: `/admin/posts/${postId}`,
    ...form({ spaceId, slug, title, excerpt: "", bodyMd: "Cuerpo.", tags: "uno, dos", categoryIds: [categoryId], coverMediaId: cover.id }, cookie),
  });
  await app.inject({ method: "POST", url: `/admin/posts/${postId}/publish`, headers: { cookie } });

  t.mock.method(
    globalThis,
    "fetch",
    () =>
      new Response(
        JSON.stringify({
          id: "chatcmpl-test",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "openrouter/auto",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: JSON.stringify({ title: "Title", excerpt: "", slug: `en-${slug}`, bodyMd: "Body." }) },
              finish_reason: "stop",
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  );

  const translate = await app.inject({ method: "POST", url: `/admin/posts/${postId}/translate`, headers: { cookie } });
  assert.equal(translate.statusCode, 302, translate.body);
  const translatedId = translate.headers.location?.toString().split("/").pop();
  assert.ok(translatedId);

  const tagRows = await db.select({ tagId: postTags.tagId }).from(postTags).where(eq(postTags.postId, translatedId));
  const categoryRows = await db.select({ id: postCategories.categoryId }).from(postCategories).where(eq(postCategories.postId, translatedId));
  const [translated] = await db.select({ coverMediaId: posts.coverMediaId }).from(posts).where(eq(posts.id, translatedId));
  assert.equal(tagRows.length, 2);
  assert.deepEqual(categoryRows.map((row) => row.id), [categoryId]);
  assert.equal(translated?.coverMediaId, cover.id);

  await app.close();
});

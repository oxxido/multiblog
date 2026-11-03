import { test, after } from "node:test";
import assert from "node:assert/strict";

process.env.BASE_DOMAIN ??= "localhost";
process.env.DATABASE_URL ??= "postgres://multiblog:dev@localhost:5433/multiblog";
process.env.OPENROUTER_API_KEY ??= "sk-test-not-a-real-key";

const { buildApp } = await import("../../src/app.js");
const { db, closeDb } = await import("../../src/db/client.js");
const { users } = await import("../../src/db/schema.js");
const { hashPassword } = await import("../../src/modules/auth/password.js");

after(closeDb);

const ADMIN_EMAIL = "ai-assist-acceptance@example.com";
const ADMIN_PASSWORD = "ai-assist-acceptance-password";

const passwordHash = hashPassword(ADMIN_PASSWORD);
await db
  .insert(users)
  .values({ email: ADMIN_EMAIL, passwordHash })
  .onConflictDoUpdate({ target: users.email, set: { passwordHash } });

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
  assert.ok(sessionCookie);
  return `session=${sessionCookie.value}`;
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

const BODY_MD = 'Un texto con herrores.\n\n:::callout{type="info"}\nOjo con esto.\n:::\n';

function assist(app: App, cookie: string, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/admin/posts/assist",
    headers: { "content-type": "application/json", cookie },
    payload,
  });
}

test("asistir devuelve el Markdown propuesto sin tocar ningún post", async (t) => {
  const app = await buildApp();
  const cookie = await login(app);
  const fixed = 'Un texto con errores.\n\n:::callout{type="info"}\nOjo con esto.\n:::\n';
  t.mock.method(globalThis, "fetch", () => chatCompletionResponse(fixed));

  const response = await assist(app, cookie, { prompt: "Corregí", bodyMd: BODY_MD });

  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json(), { bodyMd: fixed });
  await app.close();
});

test("asistir retira el fence que envuelve toda la respuesta", async (t) => {
  const app = await buildApp();
  const cookie = await login(app);
  const fixed = 'Un texto con errores.\n\n:::callout{type="info"}\nOjo con esto.\n:::';
  t.mock.method(globalThis, "fetch", () => chatCompletionResponse("```markdown\n" + fixed + "\n```"));

  const response = await assist(app, cookie, { prompt: "Corregí", bodyMd: BODY_MD });

  assert.equal(response.statusCode, 200, response.body);
  assert.deepEqual(response.json(), { bodyMd: fixed });
  await app.close();
});

test("asistir rechaza un resultado que altera las directivas", async (t) => {
  const app = await buildApp();
  const cookie = await login(app);
  t.mock.method(globalThis, "fetch", () =>
    chatCompletionResponse('Un texto con errores.\n\n:::callout{type="warning"}\nOjo con esto.\n:::\n'),
  );

  const response = await assist(app, cookie, { prompt: "Mejorá", bodyMd: BODY_MD });

  assert.equal(response.statusCode, 502);
  assert.match(response.json<{ error: string }>().error, /bloques/);
  await app.close();
});

test("asistir exige prompt y texto", async () => {
  const app = await buildApp();
  const cookie = await login(app);

  assert.equal((await assist(app, cookie, { prompt: "  ", bodyMd: BODY_MD })).statusCode, 400);
  assert.equal((await assist(app, cookie, { prompt: "Corregí", bodyMd: "" })).statusCode, 400);
  await app.close();
});

test("asistir exige sesión de admin", async () => {
  const app = await buildApp();

  const response = await app.inject({
    method: "POST",
    url: "/admin/posts/assist",
    headers: { "content-type": "application/json" },
    payload: { prompt: "Corregí", bodyMd: BODY_MD },
  });

  assert.notEqual(response.statusCode, 200);
  await app.close();
});

import { test, after } from "node:test";
import assert from "node:assert/strict";

process.env.BASE_DOMAIN ??= "localhost";
process.env.DATABASE_URL ??= "postgres://multiblog:dev@localhost:5433/multiblog";

const { buildApp } = await import("../../src/app.js");
const { closeDb } = await import("../../src/db/client.js");

after(closeDb);

test("GET /hola en nutricion.localhost devuelve el post de nutrición", async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/hola",
    headers: { host: "nutricion.localhost" },
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Hola desde Nutrición/);
  await app.close();
});

test("GET /hola en ideas.localhost devuelve el post de ideas, distinto", async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/hola",
    headers: { host: "ideas.localhost" },
  });

  assert.equal(response.statusCode, 200);
  assert.match(response.body, /Hola desde Ideas/);
  await app.close();
});

test("GET / en un espacio desconocido devuelve 404", async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/",
    headers: { host: "otroespacio.localhost" },
  });

  assert.equal(response.statusCode, 404);
  await app.close();
});

test("GET /health responde sin importar el Host", async () => {
  const app = await buildApp();
  const response = await app.inject({
    method: "GET",
    url: "/health",
    headers: { host: "otroespacio.localhost" },
  });

  assert.equal(response.statusCode, 200);
  await app.close();
});

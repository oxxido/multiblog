import { test } from "node:test";
import assert from "node:assert/strict";

// pipeline.ts pasa a depender de la base desde S7 (el plugin de imágenes,
// docs/slices/07.md §0): sólo consulta si el documento referencia /media/,
// pero el cliente de src/db/client.ts se construye al importar el módulo y
// necesita un DATABASE_URL sintácticamente válido para eso, aunque ningún
// test de este archivo llegue a ejecutar una query real.
process.env.BASE_DOMAIN ??= "localhost";
process.env.DATABASE_URL ??= "postgres://multiblog:dev@localhost:5433/multiblog";

const { renderMarkdown } = await import("../../src/markdown/pipeline.js");

test("convierte encabezados y párrafos a HTML", async () => {
  const html = await renderMarkdown("# Título\n\nUn párrafo.");
  assert.match(html, /<h1>Título<\/h1>/);
  assert.match(html, /<p>Un párrafo\.<\/p>/);
});

test("resalta bloques de código con shiki", async () => {
  const html = await renderMarkdown("```js\nconsole.log(1)\n```");
  assert.match(html, /<pre style="background-color:/);
  assert.match(html, /<span style="color:/);
});

test("sanea HTML embebido en el markdown", async () => {
  const html = await renderMarkdown("<script>alert(1)</script>\n\nTexto.");
  assert.doesNotMatch(html, /<script>/);
});

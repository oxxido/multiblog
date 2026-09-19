import { test } from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../../src/markdown/pipeline.js";

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

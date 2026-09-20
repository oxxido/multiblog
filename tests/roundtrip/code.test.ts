import { test } from "node:test";
import assert from "node:assert/strict";
import { fromMarkdown } from "../../src/markdown/tiptap/fromMarkdown.js";
import { toMarkdown } from "../../src/markdown/tiptap/toMarkdown.js";

test("bloque de código con lenguaje sobrevive el viaje completo", () => {
  const md = "```ts\nconst x: number = 1;\n```\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

test("bloque de código sin lenguaje sobrevive el viaje completo", () => {
  const md = "```\nsin lenguaje\n```\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

test("bloque de código multilínea sobrevive el viaje completo", () => {
  const md = "```js\nfunction suma(a, b) {\n  return a + b;\n}\n```\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

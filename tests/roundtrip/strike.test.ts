import { test } from "node:test";
import assert from "node:assert/strict";
import { fromMarkdown } from "../../src/markdown/tiptap/fromMarkdown.js";
import { toMarkdown } from "../../src/markdown/tiptap/toMarkdown.js";

test("texto tachado sobrevive el viaje completo", () => {
  const md = "Esto está ~~mal~~ bien.\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

test("tachado combinado con negrita y cursiva queda estable", () => {
  const md = "~~**fuerte** y *suave*~~\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

test("tachado dentro de una lista y de una celda de tabla sobrevive el viaje completo", () => {
  const md = "- ~~uno~~\n- dos\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
  const table = "| a     | b |\n| ----- | - |\n| ~~x~~ | y |\n";
  assert.equal(toMarkdown(fromMarkdown(table)), table);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { fromMarkdown } from "../../src/markdown/tiptap/fromMarkdown.js";
import { toMarkdown } from "../../src/markdown/tiptap/toMarkdown.js";

test("lista sin orden sobrevive el viaje completo", () => {
  const md = "- uno\n- dos\n- tres\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

test("lista ordenada que empieza en 1 sobrevive el viaje completo", () => {
  const md = "1. primero\n2. segundo\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

test("lista ordenada que empieza en un número distinto de 1 conserva el inicio", () => {
  const md = "5. quinto\n6. sexto\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

test("lista con un nivel anidado sobrevive el viaje completo", () => {
  const md = "- uno\n- dos\n  - anidado uno\n  - anidado dos\n- tres\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

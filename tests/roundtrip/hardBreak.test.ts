import { test } from "node:test";
import assert from "node:assert/strict";
import { fromMarkdown } from "../../src/markdown/tiptap/fromMarkdown.js";
import { toMarkdown } from "../../src/markdown/tiptap/toMarkdown.js";

test("salto de línea dentro de un párrafo sobrevive el viaje completo", () => {
  const md = "Primera línea\\\nsegunda línea.\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

test("dos espacios al final de línea se normalizan a barra invertida y quedan estables", () => {
  const normalized = toMarkdown(fromMarkdown("uno  \ndos\n"));
  assert.equal(normalized, "uno\\\ndos\n");
  assert.equal(toMarkdown(fromMarkdown(normalized)), normalized);
});

test("salto de línea dentro de una lista sobrevive el viaje completo", () => {
  const md = "- uno\\\n  y medio\n- dos\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

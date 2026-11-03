import { test } from "node:test";
import assert from "node:assert/strict";
import { fromMarkdown } from "../../src/markdown/tiptap/fromMarkdown.js";
import { toMarkdown } from "../../src/markdown/tiptap/toMarkdown.js";

test("línea horizontal entre párrafos sobrevive el viaje completo", () => {
  const md = "Antes.\n\n---\n\nDespués.\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

test("línea horizontal entre dos bloques de otro tipo sobrevive el viaje completo", () => {
  const md = "## Título\n\n---\n\n- uno\n- dos\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

test("*** y ___ se normalizan a --- y quedan estables", () => {
  const normalized = toMarkdown(fromMarkdown("a\n\n***\n\nb\n\n___\n\nc\n"));
  assert.equal(normalized, "a\n\n---\n\nb\n\n---\n\nc\n");
  assert.equal(toMarkdown(fromMarkdown(normalized)), normalized);
});

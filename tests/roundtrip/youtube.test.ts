import { test } from "node:test";
import assert from "node:assert/strict";
import { fromMarkdown } from "../../src/markdown/tiptap/fromMarkdown.js";
import { toMarkdown } from "../../src/markdown/tiptap/toMarkdown.js";

test("youtube con título sobrevive el viaje completo", () => {
  const md = '::youtube[dQw4w9WgXcQ]{title="Nunca me des"}\n';
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

// Un `title` vacío no valida (docs/slices/06.md §0: min(1)) y cae al valor
// por defecto.
test("un title vacío cae al valor por defecto", () => {
  const md = '::youtube[dQw4w9WgXcQ]{title=""}\n';
  const canonical = '::youtube[dQw4w9WgXcQ]{title="Video de YouTube"}\n';
  assert.equal(toMarkdown(fromMarkdown(md)), canonical);
});

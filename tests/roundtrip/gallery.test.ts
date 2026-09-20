import { test } from "node:test";
import assert from "node:assert/strict";
import { fromMarkdown } from "../../src/markdown/tiptap/fromMarkdown.js";
import { toMarkdown } from "../../src/markdown/tiptap/toMarkdown.js";

test("gallery con varias imágenes y alt sobrevive el viaje completo", () => {
  const md =
    ':::gallery{cols="3"}\n' +
    "![Un gato mirando por la ventana](https://example.com/a.jpg)\n\n" +
    "![](https://example.com/b.jpg)\n" +
    ":::\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

// Un `cols` que no valida (docs/slices/06.md §0) cae a su valor por defecto
// (2) en vez de romper la conversión.
test("un cols inválido cae al valor por defecto", () => {
  const md = ':::gallery{cols="9"}\n![Foto](https://example.com/a.jpg)\n:::\n';
  const canonical = ':::gallery{cols="2"}\n![Foto](https://example.com/a.jpg)\n:::\n';
  assert.equal(toMarkdown(fromMarkdown(md)), canonical);
});

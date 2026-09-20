import { test } from "node:test";
import assert from "node:assert/strict";
import { fromMarkdown } from "../../src/markdown/tiptap/fromMarkdown.js";
import { toMarkdown } from "../../src/markdown/tiptap/toMarkdown.js";

test("callout con un párrafo sobrevive el viaje completo", () => {
  const md = ':::callout{type="warning"}\nCuidado con esto, es importante.\n:::\n';
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

test("callout con varios párrafos sobrevive el viaje completo", () => {
  const md = ':::callout{type="info"}\nPrimer párrafo.\n\nSegundo párrafo.\n:::\n';
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

// Un `type` que no valida (docs/slices/06.md §0) cae a su valor por
// defecto ("info") en vez de romper la conversión — su forma canónica ya
// no es la de entrada.
test("un type inválido cae al valor por defecto", () => {
  const md = ':::callout{type="peligro"}\nTexto.\n:::\n';
  const canonical = ':::callout{type="info"}\nTexto.\n:::\n';
  assert.equal(toMarkdown(fromMarkdown(md)), canonical);
});

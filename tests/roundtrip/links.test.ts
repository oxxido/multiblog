import { test } from "node:test";
import assert from "node:assert/strict";
import { fromMarkdown } from "../../src/markdown/tiptap/fromMarkdown.js";
import { toMarkdown } from "../../src/markdown/tiptap/toMarkdown.js";

test("enlace simple sobrevive el viaje completo", () => {
  const md = "Visitá [este enlace](https://example.com).\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

test("enlace con título sobrevive el viaje completo", () => {
  const md = 'Visitá [este enlace](https://example.com "un título").\n';
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

// ProseMirror ordena las marcas de un nodo de texto por rango del esquema,
// no por el orden en que aparecían en el Markdown de origen: un enlace en
// negrita vuelve con el enlace afuera, no porque se haya perdido la negrita
// (sigue ahí) sino porque esa es la forma canónica una vez que pasa por el
// documento del editor. El viaje es estable a partir de esa forma.
test("enlace en negrita conserva ambas marcas en su forma canónica", () => {
  const md = "**[negrita con enlace](https://example.com)**\n";
  const canonical = "[**negrita con enlace**](https://example.com)\n";
  const once = toMarkdown(fromMarkdown(md));
  assert.equal(once, canonical);
  assert.equal(toMarkdown(fromMarkdown(once)), canonical);
});

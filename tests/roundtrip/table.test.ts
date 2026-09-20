import { test } from "node:test";
import assert from "node:assert/strict";
import { fromMarkdown } from "../../src/markdown/tiptap/fromMarkdown.js";
import { toMarkdown } from "../../src/markdown/tiptap/toMarkdown.js";

test("tabla sin alineación sobrevive el viaje completo", () => {
  const md = "| a | b |\n| - | - |\n| 1 | 2 |\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

// remark normaliza el ancho de las columnas y la forma del separador de
// alineación (":---" -> ":--", por ejemplo) al volver a texto; esa es la
// forma canónica de esta corrida, no la que escribió la persona a mano.
test("tabla con columnas alineadas a izquierda, centro y derecha conserva la alineación", () => {
  const md = "| Izq | Centro | Der |\n| :-- | :-: | --: |\n| a | b | c |\n";
  const canonical = "| Izq | Centro | Der |\n| :-- | :----: | --: |\n| a   |    b   |   c |\n";
  const once = toMarkdown(fromMarkdown(md));
  assert.equal(once, canonical);
  assert.equal(toMarkdown(fromMarkdown(once)), canonical);
});

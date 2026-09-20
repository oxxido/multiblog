import { test } from "node:test";
import assert from "node:assert/strict";
import { fromMarkdown } from "../../src/markdown/tiptap/fromMarkdown.js";
import { toMarkdown } from "../../src/markdown/tiptap/toMarkdown.js";

test("encabezados del nivel 1 al 6 sobreviven el viaje completo", () => {
  const md = "# Uno\n\n## Dos\n\n### Tres\n\n###### Seis\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

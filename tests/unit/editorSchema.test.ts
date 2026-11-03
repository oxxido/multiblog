import { test } from "node:test";
import assert from "node:assert/strict";
import { tiptapSchema } from "../../src/markdown/tiptap/extensions.js";
import { toMarkdown } from "../../src/markdown/tiptap/toMarkdown.js";
import { fromMarkdown } from "../../src/markdown/tiptap/fromMarkdown.js";

// Si el esquema del editor admite un nodo o marca que toMarkdown no sabe
// escribir, guardar falla justo con el texto que el autor acaba de escribir.
test("el editor visual no admite nodos ni marcas que no se puedan guardar", () => {
  const savableNodes = new Set([
    "doc", "text", "paragraph", "heading", "blockquote", "bulletList", "orderedList", "listItem",
    "codeBlock", "horizontalRule", "hardBreak", "table", "tableRow", "tableHeader", "tableCell", "image", "callout", "gallery", "youtube",
  ]);
  const savableMarks = new Set(["bold", "italic", "strike", "code", "link"]);

  assert.deepEqual(Object.keys(tiptapSchema.nodes).filter((name) => !savableNodes.has(name)), []);
  assert.deepEqual(Object.keys(tiptapSchema.marks).filter((name) => !savableMarks.has(name)), []);
});

test("un post largo con listas, código y bloques sobrevive md → tiptap → md", () => {
  const md = Array.from({ length: 400 }, (_, i) => `## Sección ${String(i)}\n\nTexto con **negrita**, *cursiva* y [enlace](https://example.com/${String(i)}).\n\n- uno\n- dos\n`).join("\n");
  const normalized = toMarkdown(fromMarkdown(md));
  assert.equal(toMarkdown(fromMarkdown(normalized)), normalized);
});

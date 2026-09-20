import { test } from "node:test";
import assert from "node:assert/strict";
import { fromMarkdown } from "../../src/markdown/tiptap/fromMarkdown.js";
import { toMarkdown } from "../../src/markdown/tiptap/toMarkdown.js";

test("párrafo con negrita, itálica y código en línea sobrevive el viaje completo", () => {
  const md = "Un párrafo con **negrita**, *itálica* y `código en línea` mezclados.\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

test("párrafo sin marcas sobrevive el viaje completo", () => {
  const md = "Sólo texto plano, sin marcas.\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

// Un post recién creado (T5 de docs/slices/05.md) arranca con body_md vacío;
// el editor visual tiene que poder abrir ese documento sin contenido y
// devolver Markdown vacío, no un salto de línea suelto.
test("un cuerpo vacío sobrevive el viaje completo", () => {
  const md = "";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

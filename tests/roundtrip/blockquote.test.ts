import { test } from "node:test";
import assert from "node:assert/strict";
import { fromMarkdown } from "../../src/markdown/tiptap/fromMarkdown.js";
import { toMarkdown } from "../../src/markdown/tiptap/toMarkdown.js";

test("cita simple sobrevive el viaje completo", () => {
  const md = "> Una cita simple.\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

test("cita con varios párrafos sobrevive el viaje completo", () => {
  const md = "> Primer párrafo.\n>\n> Segundo párrafo.\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

test("cita con una lista adentro sobrevive el viaje completo", () => {
  const md = "> cita con lista:\n>\n> - uno\n> - dos\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { fromMarkdown } from "../../src/markdown/tiptap/fromMarkdown.js";
import { toMarkdown } from "../../src/markdown/tiptap/toMarkdown.js";

test("imagen suelta con alt sobrevive el viaje completo", () => {
  const md = "![Un gato mirando por la ventana](/media/abc.jpg)\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

test("imagen suelta sin alt sobrevive el viaje completo", () => {
  const md = "![](/media/abc.jpg)\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

test("imagen entre párrafos no pierde el texto que la rodea", () => {
  const md = "Antes.\n\n![Un gato](/media/abc.jpg)\n\nDespués.\n";
  assert.equal(toMarkdown(fromMarkdown(md)), md);
});

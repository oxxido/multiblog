import { test } from "node:test";
import assert from "node:assert/strict";
import { directiveShapesMatch, extractDirectiveShape } from "../../../src/modules/translation/validate.js";

test("dos markdown idénticos en directivas coinciden", () => {
  const original = ':::callout{type="tip"}\nOjo con esto.\n:::\n';
  const translated = ':::callout{type="tip"}\nHeads up.\n:::\n';
  assert.equal(directiveShapesMatch(extractDirectiveShape(original), extractDirectiveShape(translated)), true);
});

test("un atributo distinto no coincide", () => {
  const original = ':::callout{type="tip"}\nOjo.\n:::\n';
  const translated = ':::callout{type="warning"}\nHeads up.\n:::\n';
  assert.equal(directiveShapesMatch(extractDirectiveShape(original), extractDirectiveShape(translated)), false);
});

test("una directiva de menos no coincide", () => {
  const original = ':::callout{type="tip"}\nOjo.\n:::\n\n::youtube{id="abc123"}\n';
  const translated = ':::callout{type="tip"}\nHeads up.\n:::\n';
  assert.equal(directiveShapesMatch(extractDirectiveShape(original), extractDirectiveShape(translated)), false);
});

test("una directiva de más no coincide", () => {
  const original = ':::callout{type="tip"}\nOjo.\n:::\n';
  const translated = ':::callout{type="tip"}\nHeads up.\n:::\n\n::youtube{id="abc123"}\n';
  assert.equal(directiveShapesMatch(extractDirectiveShape(original), extractDirectiveShape(translated)), false);
});

test("mismo nombre y atributos pero tipo de directiva distinto no coincide", () => {
  const original = '::widget{a="1"}\n';
  const translated = ':::widget{a="1"}\ncontenido\n:::\n';
  assert.equal(directiveShapesMatch(extractDirectiveShape(original), extractDirectiveShape(translated)), false);
});

test("cero directivas en ambos coincide", () => {
  const original = "Solo texto plano, sin bloques.\n";
  const translated = "Just plain text, no blocks.\n";
  assert.equal(directiveShapesMatch(extractDirectiveShape(original), extractDirectiveShape(translated)), true);
});

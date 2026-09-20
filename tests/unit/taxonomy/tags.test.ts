import { test } from "node:test";
import assert from "node:assert/strict";

process.env.BASE_DOMAIN ??= "localhost";
process.env.DATABASE_URL ??= "postgres://multiblog:dev@localhost:5433/multiblog";

const { parseTagNames, slugifyTagName } = await import("../../../src/modules/taxonomy/tags.js");

test("slugifyTagName pasa a minúsculas y quita acentos", () => {
  assert.equal(slugifyTagName("Nutrición"), "nutricion");
});

test("slugifyTagName cambia espacios y símbolos por guiones", () => {
  assert.equal(slugifyTagName("Vida Sana!!"), "vida-sana");
});

test("parseTagNames separa por coma y recorta espacios", () => {
  assert.deepEqual(parseTagNames(" ia , recetas ,  vida sana "), ["ia", "recetas", "vida sana"]);
});

test("parseTagNames descarta partes vacías", () => {
  assert.deepEqual(parseTagNames("ia,,recetas,"), ["ia", "recetas"]);
});

test("parseTagNames dedupe case-insensitive preservando el primer casing", () => {
  assert.deepEqual(parseTagNames("IA, ia, Recetas, recetas"), ["IA", "Recetas"]);
});

test("parseTagNames sobre texto vacío da lista vacía", () => {
  assert.deepEqual(parseTagNames(""), []);
  assert.deepEqual(parseTagNames("   "), []);
});

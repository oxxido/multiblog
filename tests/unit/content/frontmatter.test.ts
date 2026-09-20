import { test } from "node:test";
import assert from "node:assert/strict";

const { parseFrontMatterFile, serializeFrontMatterFile } = await import(
  "../../../src/modules/content/frontmatter.js"
);

test("parseFrontMatterFile separa datos y cuerpo", () => {
  const raw = ["---", "title: Hola", "slug: hola", "status: published", "---", "", "# Hola", "", "Cuerpo."].join("\n");

  const { data, bodyMd } = parseFrontMatterFile(raw);

  assert.deepEqual(data, { title: "Hola", slug: "hola", status: "published" });
  assert.equal(bodyMd, "# Hola\n\nCuerpo.");
});

test("parseFrontMatterFile recorta espacios de clave y valor", () => {
  const raw = ["---", "  title  :   Hola  ", "---", "Cuerpo"].join("\n");
  const { data } = parseFrontMatterFile(raw);
  assert.equal(data.title, "Hola");
});

test("parseFrontMatterFile conserva el resto de un valor con dos puntos", () => {
  const raw = ["---", "title: Hola: subtítulo", "---", "Cuerpo"].join("\n");
  const { data } = parseFrontMatterFile(raw);
  assert.equal(data.title, "Hola: subtítulo");
});

test("parseFrontMatterFile ignora líneas vacías dentro del front-matter", () => {
  const raw = ["---", "title: Hola", "", "slug: hola", "---", "Cuerpo"].join("\n");
  const { data } = parseFrontMatterFile(raw);
  assert.deepEqual(data, { title: "Hola", slug: "hola" });
});

test("serializeFrontMatterFile omite claves undefined", () => {
  const result = serializeFrontMatterFile(
    { title: "Hola", slug: "hola", status: "draft", excerpt: undefined },
    "Cuerpo.",
  );

  assert.equal(result, ["---", "title: Hola", "slug: hola", "status: draft", "---", "", "Cuerpo."].join("\n"));
});

test("serializeFrontMatterFile mantiene siempre el mismo orden de campos", () => {
  const result = serializeFrontMatterFile(
    { tags: "a, b", title: "Hola", categories: "cat", slug: "hola", status: "draft" },
    "Cuerpo.",
  );

  const lines = result.split("\n");
  assert.deepEqual(lines.slice(0, 6), ["---", "title: Hola", "slug: hola", "status: draft", "categories: cat", "tags: a, b"]);
});

test("round-trip exacto: parse(serialize(x)) === x", () => {
  const data = {
    title: "Un título: con dos puntos",
    slug: "un-titulo",
    status: "scheduled",
    published_at: "2026-01-01T00:00:00.000Z",
    excerpt: "Un extracto",
    categories: "cat-a, cat-b",
    tags: "tag uno, tag dos",
    translation_of: "otro-slug",
  };
  const bodyMd = "# Título\n\nCuerpo con **negrita** y una línea más.\n";

  const serialized = serializeFrontMatterFile(data, bodyMd);
  const parsed = parseFrontMatterFile(serialized);

  assert.deepEqual(parsed.data, data);
  assert.equal(parsed.bodyMd, bodyMd);
});

test("parseFrontMatterFile con campos opcionales ausentes", () => {
  const raw = ["---", "title: Hola", "slug: hola", "status: draft", "---", "Cuerpo"].join("\n");
  const { data } = parseFrontMatterFile(raw);
  assert.equal(data.excerpt, undefined);
  assert.equal(data.translation_of, undefined);
});

test("parseFrontMatterFile tira si no empieza con el delimitador", () => {
  assert.throws(() => parseFrontMatterFile("title: Hola\n---\nCuerpo"));
});

test("parseFrontMatterFile tira si falta el delimitador de cierre", () => {
  assert.throws(() => parseFrontMatterFile("---\ntitle: Hola\nCuerpo"));
});

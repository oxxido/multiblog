import { test } from "node:test";
import assert from "node:assert/strict";

process.env.BASE_DOMAIN ??= "localhost";
process.env.DATABASE_URL ??= "postgres://multiblog:dev@localhost:5433/multiblog";

const { buildResponsiveImage, parseMediaUrl, widthsFor } = await import("../../../src/modules/media/derivatives.js");

test("widthsFor filtra los anchos fijos por el ancho original", () => {
  assert.deepEqual(widthsFor(1280), [320, 640, 960, 1280]);
});

test("un original más chico que el mínimo genera un único derivado a su propio ancho", () => {
  assert.deepEqual(widthsFor(180), [180]);
});

test("un original exactamente en un ancho de la lista lo incluye una sola vez", () => {
  assert.deepEqual(widthsFor(960), [320, 640, 960]);
});

test("buildResponsiveImage arma src, srcset y las dimensiones originales", () => {
  const image = buildResponsiveImage({ id: "abc", width: 800, height: 400 });
  assert.equal(image.src, "/media/abc-640.webp");
  assert.equal(image.srcset, "/media/abc-320.webp 320w, /media/abc-640.webp 640w");
  assert.equal(image.width, 800);
  assert.equal(image.height, 400);
});

test("buildResponsiveImage sobre un original angosto usa su propio ancho", () => {
  const image = buildResponsiveImage({ id: "abc", width: 180, height: 90 });
  assert.equal(image.src, "/media/abc-180.webp");
  assert.equal(image.srcset, "/media/abc-180.webp 180w");
});

test("parseMediaUrl extrae el id de una URL de media", () => {
  const id = "9c858901-8a57-4791-81fe-4c455b099bc9";
  assert.equal(parseMediaUrl(`/media/${id}.jpg`), id);
});

test("parseMediaUrl devuelve null para una URL externa", () => {
  assert.equal(parseMediaUrl("https://example.com/a.jpg"), null);
  assert.equal(parseMediaUrl("/media/no-es-un-uuid.jpg"), null);
});

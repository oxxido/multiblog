import { test } from "node:test";
import assert from "node:assert/strict";

const { buildSitemapIndexXml, buildUrlsetXml } = await import("../../../src/modules/feed/sitemap.js");

test("buildUrlsetXml arma un urlset mínimo válido", () => {
  const xml = buildUrlsetXml([{ loc: "http://nutricion.localhost/" }]);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<loc>http:\/\/nutricion\.localhost\/<\/loc>/);
  assert.doesNotMatch(xml, /<lastmod>/);
});

test("buildUrlsetXml incluye lastmod en ISO 8601 cuando se da", () => {
  const xml = buildUrlsetXml([{ loc: "http://nutricion.localhost/un-post", lastmod: new Date("2026-02-01T00:00:00.000Z") }]);
  assert.match(xml, /<lastmod>2026-02-01T00:00:00\.000Z<\/lastmod>/);
});

test("buildUrlsetXml escapa el loc", () => {
  const xml = buildUrlsetXml([{ loc: "http://nutricion.localhost/a&b" }]);
  assert.match(xml, /<loc>http:\/\/nutricion\.localhost\/a&amp;b<\/loc>/);
});

test("buildSitemapIndexXml sólo apunta a otros sitemaps, sin <url>", () => {
  const xml = buildSitemapIndexXml([{ loc: "http://nutricion.localhost/sitemap.xml" }, { loc: "http://ideas.localhost/sitemap.xml" }]);
  assert.match(xml, /<sitemapindex xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(xml, /<sitemap>\s*<loc>http:\/\/nutricion\.localhost\/sitemap\.xml<\/loc>\s*<\/sitemap>/);
  assert.doesNotMatch(xml, /<url>/);
});

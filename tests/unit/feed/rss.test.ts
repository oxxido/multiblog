import { test } from "node:test";
import assert from "node:assert/strict";

const { buildRssXml, escapeXmlText } = await import("../../../src/modules/feed/rss.js");

test("escapeXmlText escapa & < > \" '", () => {
  assert.equal(escapeXmlText(`Tom & Jerry <b>"quoted"</b> it's`), "Tom &amp; Jerry &lt;b&gt;&quot;quoted&quot;&lt;/b&gt; it&apos;s");
});

test("buildRssXml arma un canal válido con sus items", () => {
  const xml = buildRssXml({
    title: "Nutrición & Vida",
    link: "http://nutricion.localhost/",
    description: "Un blog",
    language: "es",
    items: [
      {
        title: "Un post",
        link: "http://nutricion.localhost/un-post",
        guid: "http://nutricion.localhost/un-post",
        pubDate: new Date("2026-01-15T10:00:00.000Z"),
        description: "Extracto",
        contentEncoded: "<p>Cuerpo <strong>completo</strong></p>",
      },
    ],
  });

  assert.match(xml, /<rss version="2.0" xmlns:content="http:\/\/purl.org\/rss\/1.0\/modules\/content\/">/);
  assert.match(xml, /<title>Nutrición &amp; Vida<\/title>/);
  assert.match(xml, /<link>http:\/\/nutricion\.localhost\/un-post<\/link>/);
  assert.match(xml, /<pubDate>Thu, 15 Jan 2026 10:00:00 GMT<\/pubDate>/);
  assert.match(xml, /<description><!\[CDATA\[Extracto\]\]><\/description>/);
  assert.match(xml, /<content:encoded><!\[CDATA\[<p>Cuerpo <strong>completo<\/strong><\/p>\]\]><\/content:encoded>/);
});

test("buildRssXml no re-escapa el contenido dentro de CDATA", () => {
  const xml = buildRssXml({
    title: "T",
    link: "http://a.localhost/",
    description: "D",
    language: "es",
    items: [
      {
        title: "Con ampersand",
        link: "http://a.localhost/p",
        guid: "http://a.localhost/p",
        pubDate: new Date(),
        description: "Extracto & más",
        contentEncoded: "<p>A &amp; B</p>",
      },
    ],
  });

  assert.match(xml, /<content:encoded><!\[CDATA\[<p>A &amp; B<\/p>\]\]><\/content:encoded>/);
  assert.match(xml, /<description><!\[CDATA\[Extracto & más\]\]><\/description>/);
});

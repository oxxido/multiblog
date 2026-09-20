import { escapeXmlText } from "./rss.js";

const SITEMAP_NAMESPACE = "http://www.sitemaps.org/schemas/sitemap/0.9";

export interface SitemapUrl {
  loc: string;
  lastmod?: Date;
}

function buildUrlXml(url: SitemapUrl): string {
  const lastmod = url.lastmod ? `\n    <lastmod>${url.lastmod.toISOString()}</lastmod>` : "";
  return `  <url>\n    <loc>${escapeXmlText(url.loc)}</loc>${lastmod}\n  </url>`;
}

export function buildUrlsetXml(urls: SitemapUrl[]): string {
  const items = urls.map(buildUrlXml).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<urlset xmlns="${SITEMAP_NAMESPACE}">`,
    items,
    "</urlset>",
  ].join("\n");
}

export interface SitemapIndexEntry {
  loc: string;
}

function buildSitemapEntryXml(entry: SitemapIndexEntry): string {
  return `  <sitemap>\n    <loc>${escapeXmlText(entry.loc)}</loc>\n  </sitemap>`;
}

export function buildSitemapIndexXml(sitemaps: SitemapIndexEntry[]): string {
  const items = sitemaps.map(buildSitemapEntryXml).join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<sitemapindex xmlns="${SITEMAP_NAMESPACE}">`,
    items,
    "</sitemapindex>",
  ].join("\n");
}

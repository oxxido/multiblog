export function escapeXmlText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export interface RssItem {
  title: string;
  link: string;
  guid: string;
  pubDate: Date;
  // Extracto (o el título si no hay extracto) — se inserta en CDATA, no se
  // escapa dos veces.
  description: string;
  // body_html completo, ya saneado por el pipeline (invariante 4): se
  // inserta en CDATA sin re-escapar (.claude/rules/Markdown.md).
  contentEncoded: string;
}

export interface RssChannel {
  title: string;
  link: string;
  description: string;
  language: string;
  items: RssItem[];
}

function buildItemXml(item: RssItem): string {
  return [
    "    <item>",
    `      <title>${escapeXmlText(item.title)}</title>`,
    `      <link>${escapeXmlText(item.link)}</link>`,
    `      <guid>${escapeXmlText(item.guid)}</guid>`,
    `      <pubDate>${item.pubDate.toUTCString()}</pubDate>`,
    `      <description><![CDATA[${item.description}]]></description>`,
    `      <content:encoded><![CDATA[${item.contentEncoded}]]></content:encoded>`,
    "    </item>",
  ].join("\n");
}

export function buildRssXml(channel: RssChannel): string {
  const items = channel.items.map(buildItemXml).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    "  <channel>",
    `    <title>${escapeXmlText(channel.title)}</title>`,
    `    <link>${escapeXmlText(channel.link)}</link>`,
    `    <description>${escapeXmlText(channel.description)}</description>`,
    `    <language>${escapeXmlText(channel.language)}</language>`,
    items,
    "  </channel>",
    "</rss>",
  ].join("\n");
}

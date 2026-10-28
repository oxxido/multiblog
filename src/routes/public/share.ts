import type { Dictionary } from "../../i18n/dictionary.js";

export interface ShareLink {
  key: string;
  glyph: string;
  label: string;
  href: string;
}

// Enlaces planos a los formularios de compartir de cada red: el sitio público
// no lleva JS (invariante 3), así que no hay botón de "copiar" ni SDKs.
export function shareLinksFor(url: string, title: string, strings: Dictionary): ShareLink[] {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(title);
  const both = encodeURIComponent(`${title} ${url}`);

  return [
    { key: "x", glyph: "X", label: `${strings.shareOn} X`, href: `https://twitter.com/intent/tweet?url=${u}&text=${t}` },
    {
      key: "linkedin",
      glyph: "in",
      label: `${strings.shareOn} LinkedIn`,
      href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    },
    { key: "whatsapp", glyph: "WA", label: `${strings.shareOn} WhatsApp`, href: `https://wa.me/?text=${both}` },
    {
      key: "facebook",
      glyph: "f",
      label: `${strings.shareOn} Facebook`,
      href: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    },
    { key: "email", glyph: "@", label: strings.shareByEmail, href: `mailto:?subject=${t}&body=${u}` },
  ];
}

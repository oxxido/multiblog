import type { FastifyReply, FastifyRequest } from "fastify";
import { listActiveSpacesWithPostCounts } from "../../modules/taxonomy/spaces.js";
import {
  findTagBySlug,
  listLatestAcrossSpaces,
  listPostsByTagAcrossSpaces,
  listTagsAcrossSpaces,
} from "../../modules/content/central.js";
import { getHeroTexts } from "../../modules/content/siteSettings.js";
import { resolveSiteCoverImage } from "../../modules/media/media.js";
import { env } from "../../config/env.js";
import { stringsFor } from "../../i18n/dictionary.js";
import { formatDateShort } from "../../i18n/dates.js";
import { absoluteMediaUrl, centralUrlFor, spaceUrlFor } from "../public/urls.js";

const LATEST_LIMIT = 20;
const TAGS_LIMIT = 12;
const DEFAULT_ACCENT = "#5980a6";

export async function renderCentralHome(request: FastifyRequest, reply: FastifyReply, lang: "es" | "en"): Promise<void> {
  const prefix = lang === "en" ? "/en" : "";
  const strings = stringsFor(lang);

  const [spacesList, latest, crossTags, cover, heroTexts] = await Promise.all([
    listActiveSpacesWithPostCounts(lang),
    listLatestAcrossSpaces(lang, LATEST_LIMIT),
    listTagsAcrossSpaces(lang, TAGS_LIMIT),
    resolveSiteCoverImage(),
    getHeroTexts(),
  ]);

  const totalPublished = spacesList.reduce((sum, space) => sum + space.publishedCount, 0);
  const spaceNames = new Intl.ListFormat(lang === "en" ? "en" : "es", { style: "long", type: "conjunction" }).format(
    spacesList.map((space) => space.name),
  );

  const headline = (lang === "en" ? heroTexts.headlineEn : heroTexts.headlineEs) ?? strings.centralHeadline;
  const customLead = lang === "en" ? heroTexts.leadEn : heroTexts.leadEs;
  const lead = customLead ?? (spaceNames ? `${spaceNames}. ${strings.centralLeadSuffix}` : null);

  await reply.view("central-index.eta", {
    title: env.BASE_DOMAIN,
    brand: env.BASE_DOMAIN,
    htmlLang: strings.htmlLang,
    strings,
    prefix,
    cover,
    activeCount: spacesList.length,
    totalPublished,
    headline,
    lead,
    spaces: spacesList.map((space) => ({
      name: space.name,
      description: space.description,
      accentColor: space.accentColor ?? DEFAULT_ACCENT,
      url: spaceUrlFor(request, space.subdomain, lang),
      subdomain: `${space.subdomain}.${env.BASE_DOMAIN}`,
      publishedCount: space.publishedCount,
    })),
    latest: latest.map((item) => ({
      title: item.title,
      excerpt: item.excerpt,
      accentColor: item.spaceAccentColor ?? DEFAULT_ACCENT,
      url: `${spaceUrlFor(request, item.spaceSubdomain, lang)}/${item.slug}`,
      date: formatDateShort(item.publishedAt, lang),
    })),
    tags: crossTags.map((tag) => ({ slug: tag.slug, name: tag.name, count: tag.count })),
    canonical: centralUrlFor(request, lang),
    ogType: "website",
    ogTitle: env.BASE_DOMAIN,
    ogDescription: lead ?? strings.centralLeadSuffix,
    ogImage: cover ? absoluteMediaUrl(request, cover.src) : null,
  });
}

export async function renderSpacesPage(request: FastifyRequest, reply: FastifyReply, lang: "es" | "en"): Promise<void> {
  const prefix = lang === "en" ? "/en" : "";
  const strings = stringsFor(lang);

  const [spacesList, cover] = await Promise.all([listActiveSpacesWithPostCounts(lang), resolveSiteCoverImage()]);

  await reply.view("central-spaces.eta", {
    title: `${strings.spacesNavLabel} · ${env.BASE_DOMAIN}`,
    brand: env.BASE_DOMAIN,
    htmlLang: strings.htmlLang,
    strings,
    prefix,
    cover,
    heading: strings.spacesNavLabel,
    spaces: spacesList.map((space) => ({
      name: space.name,
      description: space.description,
      accentColor: space.accentColor ?? DEFAULT_ACCENT,
      url: spaceUrlFor(request, space.subdomain, lang),
      subdomain: `${space.subdomain}.${env.BASE_DOMAIN}`,
      publishedCount: space.publishedCount,
    })),
    canonical: `${centralUrlFor(request, lang)}/espacios`,
    ogType: "website",
    ogTitle: strings.spacesNavLabel,
    ogImage: cover ? absoluteMediaUrl(request, cover.src) : null,
  });
}

export async function renderTagPage(
  request: FastifyRequest,
  reply: FastifyReply,
  lang: "es" | "en",
  tagSlug: string,
): Promise<boolean> {
  const tag = await findTagBySlug(tagSlug);
  if (!tag) {
    return false;
  }

  const prefix = lang === "en" ? "/en" : "";
  const strings = stringsFor(lang);

  const [items, cover] = await Promise.all([listPostsByTagAcrossSpaces(tag.id, lang, LATEST_LIMIT), resolveSiteCoverImage()]);

  await reply.view("central-tag.eta", {
    title: `${tag.name} · ${env.BASE_DOMAIN}`,
    brand: env.BASE_DOMAIN,
    htmlLang: strings.htmlLang,
    strings,
    prefix,
    cover,
    heading: tag.name,
    items: items.map((item) => ({
      title: item.title,
      excerpt: item.excerpt,
      accentColor: item.spaceAccentColor ?? DEFAULT_ACCENT,
      url: `${spaceUrlFor(request, item.spaceSubdomain, lang)}/${item.slug}`,
      date: formatDateShort(item.publishedAt, lang),
    })),
    canonical: `${centralUrlFor(request, lang)}/t/${tag.slug}`,
    ogType: "website",
    ogTitle: tag.name,
    ogImage: cover ? absoluteMediaUrl(request, cover.src) : null,
  });

  return true;
}

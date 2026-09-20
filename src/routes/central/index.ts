import type { FastifyReply, FastifyRequest } from "fastify";
import { listActiveSpacesWithPostCounts } from "../../modules/taxonomy/spaces.js";
import { listLatestAcrossSpaces, listTagsAcrossSpaces } from "../../modules/content/central.js";
import { resolveSiteCoverImage } from "../../modules/media/media.js";
import { env } from "../../config/env.js";
import { stringsFor } from "../../i18n/dictionary.js";
import { formatDateShort } from "../../i18n/dates.js";

const LATEST_LIMIT = 20;
const TAGS_LIMIT = 12;
const DEFAULT_ACCENT = "#5980a6";

// Mismo esquema y puerto de la petición entrante para no asumir un dominio
// fijo (.claude/rules/Db.md): los enlaces a posts de otros espacios se arman
// a partir de BASE_DOMAIN, no de una URL escrita a mano.
function spaceUrlFor(request: FastifyRequest, subdomain: string, lang: "es" | "en"): string {
  const host = request.headers.host ?? "";
  const port = host.split(":")[1];
  const suffix = lang === "en" ? "/en" : "";
  return `${request.protocol}://${subdomain}.${env.BASE_DOMAIN}${port ? `:${port}` : ""}${suffix}`;
}

export default async function renderCentralHome(
  request: FastifyRequest,
  reply: FastifyReply,
  lang: "es" | "en",
): Promise<void> {
  const [spacesList, latest, crossTags, cover] = await Promise.all([
    listActiveSpacesWithPostCounts(lang),
    listLatestAcrossSpaces(lang, LATEST_LIMIT),
    listTagsAcrossSpaces(lang, TAGS_LIMIT),
    resolveSiteCoverImage(),
  ]);

  const totalPublished = spacesList.reduce((sum, space) => sum + space.publishedCount, 0);
  const spaceNames = new Intl.ListFormat(lang === "en" ? "en" : "es", { style: "long", type: "conjunction" }).format(
    spacesList.map((space) => space.name),
  );
  const strings = stringsFor(lang);

  await reply.view("central-index.eta", {
    title: env.BASE_DOMAIN,
    brand: env.BASE_DOMAIN,
    htmlLang: strings.htmlLang,
    strings,
    cover,
    activeCount: spacesList.length,
    totalPublished,
    spaceNames,
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
    tags: crossTags.map((tag) => ({ name: tag.name, count: tag.count })),
  });
}

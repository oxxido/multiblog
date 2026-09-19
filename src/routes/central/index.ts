import type { FastifyReply, FastifyRequest } from "fastify";
import { listActiveSpacesWithPostCounts } from "../../modules/taxonomy/spaces.js";
import { listLatestAcrossSpaces, listTagsAcrossSpaces } from "../../modules/content/central.js";
import { env } from "../../config/env.js";

const LANG = "es" as const;
const LATEST_LIMIT = 20;
const TAGS_LIMIT = 12;
const DEFAULT_ACCENT = "#5980a6";

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function formatDateShort(date: Date): string {
  return `${date.getDate().toString()} ${MONTHS_SHORT[date.getMonth()] ?? ""}`;
}

// Mismo esquema y puerto de la petición entrante para no asumir un dominio
// fijo (.claude/rules/Db.md): los enlaces a posts de otros espacios se arman
// a partir de BASE_DOMAIN, no de una URL escrita a mano.
function spaceUrlFor(request: FastifyRequest, subdomain: string): string {
  const host = request.headers.host ?? "";
  const port = host.split(":")[1];
  return `${request.protocol}://${subdomain}.${env.BASE_DOMAIN}${port ? `:${port}` : ""}`;
}

export default async function renderCentralHome(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const [spacesList, latest, crossTags] = await Promise.all([
    listActiveSpacesWithPostCounts(LANG),
    listLatestAcrossSpaces(LANG, LATEST_LIMIT),
    listTagsAcrossSpaces(LANG, TAGS_LIMIT),
  ]);

  const totalPublished = spacesList.reduce((sum, space) => sum + space.publishedCount, 0);
  const spaceNames = new Intl.ListFormat("es", { style: "long", type: "conjunction" }).format(
    spacesList.map((space) => space.name),
  );

  await reply.view("central-index.eta", {
    title: env.BASE_DOMAIN,
    brand: env.BASE_DOMAIN,
    activeCount: spacesList.length,
    totalPublished,
    spaceNames,
    spaces: spacesList.map((space) => ({
      name: space.name,
      description: space.description,
      accentColor: space.accentColor ?? DEFAULT_ACCENT,
      url: spaceUrlFor(request, space.subdomain),
      subdomain: `${space.subdomain}.${env.BASE_DOMAIN}`,
      publishedCount: space.publishedCount,
    })),
    latest: latest.map((item) => ({
      title: item.title,
      excerpt: item.excerpt,
      accentColor: item.spaceAccentColor ?? DEFAULT_ACCENT,
      url: `${spaceUrlFor(request, item.spaceSubdomain)}/${item.slug}`,
      date: formatDateShort(item.publishedAt),
    })),
    tags: crossTags.map((tag) => ({ name: tag.name, count: tag.count })),
  });
}

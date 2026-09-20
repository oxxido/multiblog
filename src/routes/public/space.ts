import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  countPublishedPosts,
  countPublishedPostsByCategory,
  listPublishedPosts,
  listPublishedPostsByCategory,
  PAGE_SIZE,
} from "../../modules/content/posts.js";
import { listCategoriesForSpace } from "../../modules/taxonomy/categories.js";
import { resolveCoverImage } from "../../modules/media/media.js";
import { env } from "../../config/env.js";
import renderCentralHome from "../central/index.js";
import { stringsFor } from "../../i18n/dictionary.js";
import { formatDateLong } from "../../i18n/dates.js";

const DEFAULT_ACCENT = "#5980a6";

// Mismo esquema y puerto de la petición entrante para no asumir un dominio
// fijo (.claude/rules/Db.md) — construye la home central a partir de
// BASE_DOMAIN en vez de una URL escrita a mano.
function centralUrlFor(request: FastifyRequest, lang: "es" | "en"): string {
  const host = request.headers.host ?? "";
  const port = host.split(":")[1];
  const suffix = lang === "en" ? "/en" : "";
  return `${request.protocol}://${env.BASE_DOMAIN}${port ? `:${port}` : ""}${suffix}`;
}

const pageQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1) });

export default function spaceIndexRoutes(lang: "es" | "en") {
  const prefix = lang === "en" ? "/en" : "";
  const strings = stringsFor(lang);

  return function (fastify: FastifyInstance): void {
    fastify.get("/", async (request, reply) => {
      if (!request.space) {
        await renderCentralHome(request, reply, lang);
        return;
      }

      const { page } = pageQuerySchema.parse(request.query);
      const [{ items, hasNext }, total, categories, cover] = await Promise.all([
        listPublishedPosts(request.space.id, lang, page),
        countPublishedPosts(request.space.id, lang),
        listCategoriesForSpace(request.space.id),
        resolveCoverImage(request.space.coverMediaId),
      ]);

      await reply.view("space-index.eta", {
        heading: request.space.name,
        spaceName: request.space.name,
        subdomain: `${request.space.subdomain}.${env.BASE_DOMAIN}`,
        description: request.space.description,
        accentColor: request.space.accentColor ?? DEFAULT_ACCENT,
        centralUrl: centralUrlFor(request, lang),
        htmlLang: strings.htmlLang,
        strings,
        prefix,
        cover,
        categories: [
          { label: strings.allCategoryLabel, href: `${prefix}/`, active: true },
          ...categories.map((category) => ({
            label: category.name,
            href: `${prefix}/c/${category.slug}`,
            active: false,
          })),
        ],
        items: items.map((item) => ({
          slug: item.slug,
          title: item.title,
          excerpt: item.excerpt,
          category: item.category,
          date: formatDateLong(item.publishedAt, lang),
          readingMinutes: item.readingMinutes,
        })),
        page,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        hasNext,
        basePath: `${prefix}/`,
      });
    });

    fastify.get<{ Params: { categoria: string } }>("/c/:categoria", async (request, reply) => {
      if (!request.space) {
        await reply.code(404).send();
        return;
      }

      const { page } = pageQuerySchema.parse(request.query);
      const [result, total, categories, cover] = await Promise.all([
        listPublishedPostsByCategory(request.space.id, lang, request.params.categoria, page),
        countPublishedPostsByCategory(request.space.id, lang, request.params.categoria),
        listCategoriesForSpace(request.space.id),
        resolveCoverImage(request.space.coverMediaId),
      ]);

      if (!result || total === null) {
        await reply.code(404).send();
        return;
      }

      const activeCategory = categories.find((category) => category.slug === request.params.categoria);
      if (!activeCategory) {
        await reply.code(404).send();
        return;
      }

      await reply.view("space-index.eta", {
        heading: activeCategory.name,
        spaceName: request.space.name,
        subdomain: `${request.space.subdomain}.${env.BASE_DOMAIN}`,
        description: request.space.description,
        accentColor: request.space.accentColor ?? DEFAULT_ACCENT,
        centralUrl: centralUrlFor(request, lang),
        htmlLang: strings.htmlLang,
        strings,
        prefix,
        cover,
        categories: [
          { label: strings.allCategoryLabel, href: `${prefix}/`, active: false },
          ...categories.map((category) => ({
            label: category.name,
            href: `${prefix}/c/${category.slug}`,
            active: category.slug === request.params.categoria,
          })),
        ],
        items: result.items.map((item) => ({
          slug: item.slug,
          title: item.title,
          excerpt: item.excerpt,
          category: item.category,
          date: formatDateLong(item.publishedAt, lang),
          readingMinutes: item.readingMinutes,
        })),
        page,
        totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
        hasNext: result.hasNext,
        basePath: `${prefix}/c/${request.params.categoria}`,
      });
    });
  };
}

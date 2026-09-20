import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  countPublishedPosts,
  countPublishedPostsByCategory,
  findPostByPreviewToken,
  listPublishedPosts,
  listPublishedPostsByCategory,
  listPublishedPostsForFeed,
  listPublishedSlugsForSitemap,
  PAGE_SIZE,
} from "../../modules/content/posts.js";
import { listLatestAcrossSpacesForFeed } from "../../modules/content/central.js";
import { listCategoriesForSpace } from "../../modules/taxonomy/categories.js";
import { listActiveSpacesWithPostCounts } from "../../modules/taxonomy/spaces.js";
import { resolveCoverImage } from "../../modules/media/media.js";
import { env } from "../../config/env.js";
import { renderCentralHome, renderSpacesPage, renderTagPage } from "../central/index.js";
import { stringsFor } from "../../i18n/dictionary.js";
import { formatDateLong } from "../../i18n/dates.js";
import { buildRssXml, type RssChannel } from "../../modules/feed/rss.js";
import { buildSitemapIndexXml, buildUrlsetXml, type SitemapUrl } from "../../modules/feed/sitemap.js";
import { absoluteMediaUrl, centralUrlFor, previewUrlFor, spaceUrlFor } from "./urls.js";

const DEFAULT_ACCENT = "#5980a6";

const pageQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1) });
const tagParamsSchema = z.object({ tagSlug: z.string().min(1) });

export default function spaceIndexRoutes(lang: "es" | "en") {
  const prefix = lang === "en" ? "/en" : "";
  const strings = stringsFor(lang);

  return function (fastify: FastifyInstance): void {
    fastify.get("/", async (request, reply) => {
      if (!request.space) {
        await renderCentralHome(request, reply, lang);
        return;
      }

      const space = request.space;
      const { page } = pageQuerySchema.parse(request.query);
      const [{ items, hasNext }, total, categories, cover] = await Promise.all([
        listPublishedPosts(space.id, lang, page),
        countPublishedPosts(space.id, lang),
        listCategoriesForSpace(space.id),
        resolveCoverImage(space.coverMediaId),
      ]);

      const canonical = `${spaceUrlFor(request, space.subdomain, lang)}/`;

      await reply.view("space-index.eta", {
        heading: space.name,
        spaceName: space.name,
        subdomain: `${space.subdomain}.${env.BASE_DOMAIN}`,
        description: space.description,
        accentColor: space.accentColor ?? DEFAULT_ACCENT,
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
        canonical,
        ogType: "website",
        ogTitle: space.name,
        ogDescription: space.description,
        ogImage: cover ? absoluteMediaUrl(request, cover.src) : null,
      });
    });

    fastify.get<{ Params: { categoria: string } }>("/c/:categoria", async (request, reply) => {
      if (!request.space) {
        await reply.code(404).send();
        return;
      }

      const space = request.space;
      const { page } = pageQuerySchema.parse(request.query);
      const [result, total, categories, cover] = await Promise.all([
        listPublishedPostsByCategory(space.id, lang, request.params.categoria, page),
        countPublishedPostsByCategory(space.id, lang, request.params.categoria),
        listCategoriesForSpace(space.id),
        resolveCoverImage(space.coverMediaId),
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

      const canonical = `${spaceUrlFor(request, space.subdomain, lang)}/c/${request.params.categoria}`;

      await reply.view("space-index.eta", {
        heading: activeCategory.name,
        spaceName: space.name,
        subdomain: `${space.subdomain}.${env.BASE_DOMAIN}`,
        description: space.description,
        accentColor: space.accentColor ?? DEFAULT_ACCENT,
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
        canonical,
        ogType: "website",
        ogTitle: activeCategory.name,
        ogDescription: space.description,
        ogImage: cover ? absoluteMediaUrl(request, cover.src) : null,
      });
    });

    // Central-only (mismo patrón de guarda que GET / con request.space === null):
    // no hay página "/espacios" ni "/t/{tag}" dentro de un espacio.
    fastify.get("/espacios", async (request, reply) => {
      if (request.space) {
        await reply.code(404).send();
        return;
      }
      await renderSpacesPage(request, reply, lang);
    });

    fastify.get<{ Params: { tagSlug: string } }>("/t/:tagSlug", async (request, reply) => {
      if (request.space) {
        await reply.code(404).send();
        return;
      }
      const { tagSlug } = tagParamsSchema.parse(request.params);
      const found = await renderTagPage(request, reply, lang, tagSlug);
      if (!found) {
        await reply.code(404).send();
      }
    });

    fastify.get("/feed.xml", async (request, reply) => {
      const space = request.space;
      const channel: RssChannel = space
        ? {
            title: space.name,
            link: `${spaceUrlFor(request, space.subdomain, lang)}/`,
            description: space.description ?? space.name,
            language: strings.htmlLang,
            items: (await listPublishedPostsForFeed(space.id, lang)).map((item) => {
              const link = `${spaceUrlFor(request, space.subdomain, lang)}/${item.slug}`;
              return {
                title: item.title,
                link,
                guid: link,
                pubDate: item.publishedAt,
                description: item.excerpt ?? item.title,
                contentEncoded: item.bodyHtml,
              };
            }),
          }
        : {
            title: env.BASE_DOMAIN,
            link: centralUrlFor(request, lang),
            description: env.BASE_DOMAIN,
            language: strings.htmlLang,
            items: (await listLatestAcrossSpacesForFeed(lang)).map((item) => {
              const link = `${spaceUrlFor(request, item.spaceSubdomain, lang)}/${item.slug}`;
              return {
                title: item.title,
                link,
                guid: link,
                pubDate: item.publishedAt,
                description: item.excerpt ?? item.title,
                contentEncoded: item.bodyHtml,
              };
            }),
          };

      reply.header("content-type", "application/rss+xml; charset=utf-8");
      return reply.send(buildRssXml(channel));
    });

    fastify.get("/sitemap.xml", async (request, reply) => {
      reply.header("content-type", "application/xml; charset=utf-8");

      if (!request.space) {
        const spacesList = await listActiveSpacesWithPostCounts(lang);
        const sitemaps = spacesList.map((space) => ({
          loc: `${spaceUrlFor(request, space.subdomain, lang)}/sitemap.xml`,
        }));
        return reply.send(buildSitemapIndexXml(sitemaps));
      }

      const space = request.space;
      const baseUrl = spaceUrlFor(request, space.subdomain, lang);
      const [categoriesList, postSlugs] = await Promise.all([
        listCategoriesForSpace(space.id),
        listPublishedSlugsForSitemap(space.id, lang),
      ]);

      const urls: SitemapUrl[] = [
        { loc: `${baseUrl}/` },
        ...categoriesList.map((category) => ({ loc: `${baseUrl}/c/${category.slug}` })),
        ...postSlugs.map((post) => ({ loc: `${baseUrl}/${post.slug}`, lastmod: post.updatedAt })),
      ];

      return reply.send(buildUrlsetXml(urls));
    });
  };
}

const previewParamsSchema = z.object({ token: z.uuid() });

// Fuera de las fábricas spaceIndexRoutes/postRoutes (no depende de idioma:
// el token ya identifica un post concreto con su propio lang). Sólo resuelve
// dentro de un espacio, mismo patrón de guarda que /espacios o /t/{tag} al
// revés.
export function previewRoutes(fastify: FastifyInstance): void {
  fastify.get<{ Params: { token: string } }>("/_preview/:token", async (request, reply) => {
    if (!request.space) {
      await reply.code(404).send();
      return;
    }

    const parsedParams = previewParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      await reply.code(404).send();
      return;
    }

    const space = request.space;
    const token = parsedParams.data.token;
    const post = await findPostByPreviewToken(space.id, token);

    if (!post) {
      await reply.code(404).send();
      return;
    }

    const lang = post.lang;
    const prefix = lang === "en" ? "/en" : "";
    const strings = stringsFor(lang);
    const subdomain = `${space.subdomain}.${env.BASE_DOMAIN}`;
    const cover = await resolveCoverImage(post.coverMediaId);

    await reply.view("post.eta", {
      cover,
      title: `${post.title} · ${space.name}`,
      spaceName: space.name,
      subdomain,
      accentColor: space.accentColor ?? DEFAULT_ACCENT,
      centralUrl: centralUrlFor(request, lang),
      htmlLang: strings.htmlLang,
      strings,
      prefix,
      canonical: previewUrlFor(request, space.subdomain, token),
      postUrl: `${subdomain}/_preview/${token}`,
      heading: post.title,
      lead: post.excerpt,
      html: post.bodyHtml,
      date: post.publishedAt ? formatDateLong(post.publishedAt, lang) : "Sin publicar",
      readingMinutes: post.readingMinutes,
      category: post.category,
      tags: post.tags,
      prev: null,
      next: null,
      previewNotice: post.status !== "published",
      ogType: "article",
      ogTitle: post.title,
      ogDescription: post.excerpt,
      ogImage: cover ? absoluteMediaUrl(request, cover.src) : null,
    });
  });
}

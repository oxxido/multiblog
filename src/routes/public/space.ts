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
import { env } from "../../config/env.js";
import renderCentralHome from "../central/index.js";

const LANG = "es" as const;
const DEFAULT_ACCENT = "#5980a6";

const MONTHS = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

function formatDateLong(date: Date): string {
  return `${date.getDate().toString()} de ${MONTHS[date.getMonth()] ?? ""}`;
}

// Mismo esquema y puerto de la petición entrante para no asumir un dominio
// fijo (.claude/rules/Db.md) — construye la home central a partir de
// BASE_DOMAIN en vez de una URL escrita a mano.
function centralUrlFor(request: FastifyRequest): string {
  const host = request.headers.host ?? "";
  const port = host.split(":")[1];
  return `${request.protocol}://${env.BASE_DOMAIN}${port ? `:${port}` : ""}`;
}

const pageQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1) });

export default function spaceIndexRoutes(fastify: FastifyInstance): void {
  fastify.get("/", async (request, reply) => {
    if (!request.space) {
      await renderCentralHome(request, reply);
      return;
    }

    const { page } = pageQuerySchema.parse(request.query);
    const [{ items, hasNext }, total, categories] = await Promise.all([
      listPublishedPosts(request.space.id, LANG, page),
      countPublishedPosts(request.space.id, LANG),
      listCategoriesForSpace(request.space.id),
    ]);

    await reply.view("space-index.eta", {
      heading: request.space.name,
      spaceName: request.space.name,
      subdomain: `${request.space.subdomain}.${env.BASE_DOMAIN}`,
      description: request.space.description,
      accentColor: request.space.accentColor ?? DEFAULT_ACCENT,
      centralUrl: centralUrlFor(request),
      categories: [
        { label: "Todo", href: "/", active: true },
        ...categories.map((category) => ({ label: category.name, href: `/c/${category.slug}`, active: false })),
      ],
      items: items.map((item) => ({
        slug: item.slug,
        title: item.title,
        excerpt: item.excerpt,
        category: item.category,
        date: formatDateLong(item.publishedAt),
        readingMinutes: item.readingMinutes,
      })),
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      hasNext,
      basePath: "",
    });
  });

  fastify.get<{ Params: { categoria: string } }>("/c/:categoria", async (request, reply) => {
    if (!request.space) {
      await reply.code(404).send();
      return;
    }

    const { page } = pageQuerySchema.parse(request.query);
    const [result, total, categories] = await Promise.all([
      listPublishedPostsByCategory(request.space.id, LANG, request.params.categoria, page),
      countPublishedPostsByCategory(request.space.id, LANG, request.params.categoria),
      listCategoriesForSpace(request.space.id),
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
      centralUrl: centralUrlFor(request),
      categories: [
        { label: "Todo", href: "/", active: false },
        ...categories.map((category) => ({
          label: category.name,
          href: `/c/${category.slug}`,
          active: category.slug === request.params.categoria,
        })),
      ],
      items: result.items.map((item) => ({
        slug: item.slug,
        title: item.title,
        excerpt: item.excerpt,
        category: item.category,
        date: formatDateLong(item.publishedAt),
        readingMinutes: item.readingMinutes,
      })),
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
      hasNext: result.hasNext,
      basePath: `/c/${request.params.categoria}`,
    });
  });
}

import type { FastifyInstance, FastifyRequest } from "fastify";
import { findCurrentSlugForRedirect, findPublishedPost } from "../../modules/content/posts.js";
import { resolveCoverImage } from "../../modules/media/media.js";
import { env } from "../../config/env.js";

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

function centralUrlFor(request: FastifyRequest): string {
  const host = request.headers.host ?? "";
  const port = host.split(":")[1];
  return `${request.protocol}://${env.BASE_DOMAIN}${port ? `:${port}` : ""}`;
}

export default function postRoutes(fastify: FastifyInstance): void {
  fastify.get<{ Params: { slug: string } }>("/:slug", async (request, reply) => {
    if (!request.space) {
      await reply.code(404).send();
      return;
    }

    const { slug } = request.params;
    const space = request.space;

    const post = await findPublishedPost(space.id, LANG, slug);

    if (!post) {
      const currentSlug = await findCurrentSlugForRedirect(space.id, LANG, slug);
      if (currentSlug) {
        await reply.redirect(`/${currentSlug}`, 301);
        return;
      }

      await reply.code(404).send();
      return;
    }

    const subdomain = `${space.subdomain}.${env.BASE_DOMAIN}`;
    const cover = await resolveCoverImage(post.coverMediaId);

    await reply.view("post.eta", {
      cover,
      title: `${post.title} · ${space.name}`,
      spaceName: space.name,
      subdomain,
      accentColor: space.accentColor ?? DEFAULT_ACCENT,
      centralUrl: centralUrlFor(request),
      postUrl: `${subdomain}/${slug}`,
      heading: post.title,
      lead: post.excerpt,
      html: post.bodyHtml,
      date: formatDateLong(post.publishedAt),
      readingMinutes: post.readingMinutes,
      category: post.category,
      tags: post.tags,
      prev: post.prev,
      next: post.next,
    });
  });
}

import type { FastifyInstance } from "fastify";
import {
  findCurrentSlugForRedirect,
  findPublishedPost,
  findPublishedTranslationSibling,
} from "../../modules/content/posts.js";
import { resolveCoverImage } from "../../modules/media/media.js";
import { env } from "../../config/env.js";
import { stringsFor } from "../../i18n/dictionary.js";
import { formatDateLong } from "../../i18n/dates.js";
import { absoluteMediaUrl, centralUrlFor, postAbsoluteUrlFor } from "./urls.js";

const DEFAULT_ACCENT = "#5980a6";

export default function postRoutes(lang: "es" | "en") {
  const prefix = lang === "en" ? "/en" : "";
  const strings = stringsFor(lang);

  return function (fastify: FastifyInstance): void {
    fastify.get<{ Params: { slug: string } }>("/:slug", async (request, reply) => {
      if (!request.space) {
        await reply.code(404).send();
        return;
      }

      const { slug } = request.params;
      const space = request.space;

      const post = await findPublishedPost(space.id, lang, slug);

      if (!post) {
        const currentSlug = await findCurrentSlugForRedirect(space.id, lang, slug);
        if (currentSlug) {
          await reply.redirect(`${prefix}/${currentSlug}`, 301);
          return;
        }

        await reply.code(404).send();
        return;
      }

      const subdomain = `${space.subdomain}.${env.BASE_DOMAIN}`;
      const cover = await resolveCoverImage(post.coverMediaId);

      const sibling = await findPublishedTranslationSibling(post.translationGroupId, post.id);
      const canonical = postAbsoluteUrlFor(request, subdomain, lang, slug);
      const siblingHref = sibling ? postAbsoluteUrlFor(request, subdomain, sibling.lang, sibling.slug) : null;

      const alternates: { hreflang: string; href: string }[] = [{ hreflang: lang, href: canonical }];
      if (sibling && siblingHref) {
        alternates.push({ hreflang: sibling.lang, href: siblingHref });
      }
      // x-default apunta siempre a la versión en español, sea el post actual
      // o su hermano (docs/slices/08.md §0).
      const spanishHref = lang === "es" ? canonical : sibling?.lang === "es" && siblingHref ? siblingHref : canonical;
      alternates.push({ hreflang: "x-default", href: spanishHref });

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
        canonical,
        alternates,
        postUrl: `${subdomain}${prefix}/${slug}`,
        heading: post.title,
        lead: post.excerpt,
        html: post.bodyHtml,
        date: formatDateLong(post.publishedAt, lang),
        readingMinutes: post.readingMinutes,
        category: post.category,
        tags: post.tags,
        prev: post.prev,
        next: post.next,
        ogType: "article",
        ogTitle: post.title,
        ogDescription: post.excerpt,
        ogImage: cover ? absoluteMediaUrl(request, cover.src) : null,
      });
    });
  };
}

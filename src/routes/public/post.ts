import type { FastifyInstance } from "fastify";
import { findCurrentSlugForRedirect, findPublishedPost } from "../../modules/content/posts.js";

const LANG = "es" as const;

export default function postRoutes(fastify: FastifyInstance): void {
  fastify.get<{ Params: { slug: string } }>("/:slug", async (request, reply) => {
    const { slug } = request.params;

    const post = await findPublishedPost(request.space.id, LANG, slug);

    if (!post) {
      const currentSlug = await findCurrentSlugForRedirect(request.space.id, LANG, slug);
      if (currentSlug) {
        await reply.redirect(`/${currentSlug}`, 301);
        return;
      }

      await reply.code(404).send();
      return;
    }

    await reply.view("post.eta", {
      title: post.title,
      spaceName: request.space.name,
      html: post.bodyHtml,
    });
  });
}

import type { FastifyInstance } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { spaces } from "../../db/schema.js";
import { findCurrentSlugForRedirect, findPublishedPost } from "../../modules/content/posts.js";

const LANG = "es" as const;

export default function postRoutes(fastify: FastifyInstance): void {
  fastify.get<{ Params: { slug: string } }>("/:slug", async (request, reply) => {
    const { slug } = request.params;

    const [space] = await db
      .select({ id: spaces.id })
      .from(spaces)
      .where(eq(spaces.slug, request.space.slug))
      .limit(1);

    if (!space) {
      await reply.code(404).send();
      return;
    }

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

    await reply.view("post.eta", {
      title: post.title,
      spaceName: request.space.name,
      html: post.bodyHtml,
    });
  });
}

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { listPublishedPosts, listPublishedPostsByCategory } from "../../modules/content/posts.js";

const LANG = "es" as const;

const pageQuerySchema = z.object({ page: z.coerce.number().int().min(1).default(1) });

export default function spaceIndexRoutes(fastify: FastifyInstance): void {
  fastify.get("/", async (request, reply) => {
    const { page } = pageQuerySchema.parse(request.query);
    const { items, hasNext } = await listPublishedPosts(request.space.id, LANG, page);

    await reply.view("space-index.eta", {
      heading: request.space.name,
      spaceName: request.space.name,
      items,
      page,
      hasNext,
      basePath: "",
    });
  });

  fastify.get<{ Params: { categoria: string } }>("/c/:categoria", async (request, reply) => {
    const { page } = pageQuerySchema.parse(request.query);
    const result = await listPublishedPostsByCategory(request.space.id, LANG, request.params.categoria, page);

    if (!result) {
      await reply.code(404).send();
      return;
    }

    await reply.view("space-index.eta", {
      heading: request.params.categoria,
      spaceName: request.space.name,
      items: result.items,
      page,
      hasNext: result.hasNext,
      basePath: `/c/${request.params.categoria}`,
    });
  });
}

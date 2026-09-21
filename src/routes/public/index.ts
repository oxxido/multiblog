import type { FastifyInstance } from "fastify";
import { resolveSpaceMiddleware } from "../../middleware/space.js";
import spaceIndexRoutes, { previewRoutes } from "./space.js";
import postRoutes from "./post.js";

export default async function publicRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("onRequest", resolveSpaceMiddleware);
  await fastify.register(previewRoutes);
  await fastify.register(spaceIndexRoutes("es"));
  await fastify.register(postRoutes("es"));
  await fastify.register(spaceIndexRoutes("en"), { prefix: "/en" });
  await fastify.register(postRoutes("en"), { prefix: "/en" });
}

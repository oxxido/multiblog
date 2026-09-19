import type { FastifyInstance } from "fastify";
import { resolveSpaceMiddleware } from "../../middleware/space.js";
import spaceIndexRoutes from "./space.js";
import postRoutes from "./post.js";

export default async function publicRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook("onRequest", resolveSpaceMiddleware);
  await fastify.register(spaceIndexRoutes);
  await fastify.register(postRoutes);
}

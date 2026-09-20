import type { FastifyInstance } from "fastify";
import { requireSession } from "../../middleware/auth.js";
import authRoutes from "./auth.js";
import postRoutes from "./posts.js";
import spaceRoutes from "./spaces.js";
import categoryRoutes from "./categories.js";
import mediaRoutes from "./media.js";

export default async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(authRoutes);

  await fastify.register(async (protectedScope) => {
    protectedScope.addHook("onRequest", requireSession);

    protectedScope.get("/", async (_request, reply) => {
      return reply.redirect("/admin/posts");
    });

    await protectedScope.register(postRoutes, { prefix: "/posts" });
    await protectedScope.register(spaceRoutes, { prefix: "/espacios" });
    await protectedScope.register(categoryRoutes, { prefix: "/categorias" });
    await protectedScope.register(mediaRoutes, { prefix: "/media" });
  });
}

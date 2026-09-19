import type { FastifyInstance } from "fastify";
import { requireSession } from "../../middleware/auth.js";
import authRoutes from "./auth.js";
import postRoutes from "./posts.js";

export default async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(authRoutes);

  await fastify.register(async (protectedScope) => {
    protectedScope.addHook("onRequest", requireSession);

    protectedScope.get("/", async (_request, reply) => {
      return reply.redirect("/admin/posts");
    });

    await protectedScope.register(postRoutes, { prefix: "/posts" });
  });
}

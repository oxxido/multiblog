import type { FastifyInstance } from "fastify";
import { env } from "../../config/env.js";
import { requireSession } from "../../middleware/auth.js";
import { listActiveSpacesForNav, type SpaceNavItem } from "../../modules/taxonomy/spaces.js";
import authRoutes from "./auth.js";
import postRoutes from "./posts.js";
import spaceRoutes from "./spaces.js";
import categoryRoutes from "./categories.js";
import mediaRoutes from "./media.js";
import siteRoutes from "./site.js";

// @fastify/view mezcla reply.locals con los datos de cada reply.view() en
// tiempo de ejecución, pero no lo tipa (docs/slices/11.md T2).
declare module "fastify" {
  interface FastifyReply {
    locals: { activeSpaces: SpaceNavItem[]; currentPath: string; baseDomain: string } | null;
  }
}

export default async function adminRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(authRoutes);

  await fastify.register(async (protectedScope) => {
    protectedScope.addHook("onRequest", requireSession);

    // Sidebar compartida por todas las vistas del admin (docs/slices/11.md
    // T2): @fastify/view mezcla reply.locals con lo que cada ruta le pasa a
    // reply.view(), así que esto no requiere tocar cada manejador.
    protectedScope.addHook("onRequest", async (request, reply) => {
      reply.locals = {
        activeSpaces: await listActiveSpacesForNav(),
        currentPath: request.url,
        baseDomain: env.BASE_DOMAIN,
      };
    });

    protectedScope.get("/", async (_request, reply) => {
      return reply.redirect("/admin/posts");
    });

    await protectedScope.register(postRoutes, { prefix: "/posts" });
    await protectedScope.register(spaceRoutes, { prefix: "/espacios" });
    await protectedScope.register(categoryRoutes, { prefix: "/categorias" });
    await protectedScope.register(mediaRoutes, { prefix: "/media" });
    await protectedScope.register(siteRoutes, { prefix: "/sitio" });
  });
}

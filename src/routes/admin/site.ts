import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getSiteCoverMediaId, resolveCoverImage, setSiteCoverMediaId } from "../../modules/media/media.js";

const coverMediaIdField = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length > 0 ? value : null),
  z.uuid().nullable(),
);

const siteFormSchema = z.object({ coverMediaId: coverMediaIdField });

// Fila única, sembrada por seed.ts (D15): no hay alta ni borrado, sólo
// lectura y actualización de su cover_media_id.
export default function siteRoutes(fastify: FastifyInstance): void {
  fastify.get("/", async (_request, reply) => {
    const coverMediaId = await getSiteCoverMediaId();
    const cover = await resolveCoverImage(coverMediaId);
    await reply.view("admin/site/form.eta", { coverMediaId, cover });
  });

  fastify.post("/", async (request, reply) => {
    const parsed = siteFormSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(parsed.error.message);
    }

    await setSiteCoverMediaId(parsed.data.coverMediaId);
    return reply.redirect("/admin/sitio");
  });
}

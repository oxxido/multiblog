import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getHeroTexts, setHeroTexts } from "../../modules/content/siteSettings.js";
import { getSiteCoverMediaId, resolveCoverImage, setSiteCoverMediaId } from "../../modules/media/media.js";

const coverMediaIdField = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length > 0 ? value : null),
  z.uuid().nullable(),
);

// Los textarea mandan \r\n; vacío = volver al texto por defecto del diccionario.
const heroText = (max: number) =>
  z.preprocess(
    (value) => {
      if (typeof value !== "string") return null;
      const text = value.replace(/\r\n/g, "\n").trim();
      return text.length > 0 ? text : null;
    },
    z.string().max(max).nullable(),
  );

const siteFormSchema = z.object({
  coverMediaId: coverMediaIdField,
  headlineEs: heroText(120),
  headlineEn: heroText(120),
  leadEs: heroText(400),
  leadEn: heroText(400),
});

// Fila única, sembrada por seed.ts (D15): no hay alta ni borrado, sólo
// lectura y actualización de su portada y de los textos del héroe (D26).
export default function siteRoutes(fastify: FastifyInstance): void {
  fastify.get("/", async (_request, reply) => {
    const coverMediaId = await getSiteCoverMediaId();
    const cover = await resolveCoverImage(coverMediaId);
    const hero = await getHeroTexts();
    await reply.view("admin/site/form.eta", { coverMediaId, cover, hero });
  });

  fastify.post("/", async (request, reply) => {
    const parsed = siteFormSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(parsed.error.message);
    }

    const { coverMediaId, ...hero } = parsed.data;
    await setSiteCoverMediaId(coverMediaId);
    await setHeroTexts(hero);
    return reply.redirect("/admin/sitio");
  });
}

import Fastify, { type FastifyInstance } from "fastify";
import fastifyView from "@fastify/view";
import fastifyCookie from "@fastify/cookie";
import { Eta } from "eta";
import path from "node:path";
import publicRoutes from "./routes/public/index.js";
import adminRoutes from "./routes/admin/index.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(fastifyView, {
    engine: { eta: new Eta() },
    templates: path.join(process.cwd(), "src/views"),
  });

  await app.register(fastifyCookie);

  // Los formularios del admin no llevan JS (invariante 3): se envían como
  // application/x-www-form-urlencoded, que Fastify no parsea por defecto.
  // Object.fromEntries perdería todos los valores salvo el último de un
  // campo repetido (checkboxes de categorías, T4 de docs/slices/03.md), así
  // que un campo repetido se agrupa en un array.
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, body, done) => {
    try {
      const fields: Record<string, string | string[]> = {};
      for (const [key, value] of new URLSearchParams(body as string)) {
        const existing = fields[key];
        if (existing === undefined) {
          fields[key] = value;
        } else if (Array.isArray(existing)) {
          existing.push(value);
        } else {
          fields[key] = [existing, value];
        }
      }
      done(null, fields);
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  app.get("/health", () => ({ status: "ok" }));

  await app.register(adminRoutes, { prefix: "/admin" });
  await app.register(publicRoutes);

  return app;
}

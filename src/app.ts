import Fastify, { type FastifyInstance } from "fastify";
import fastifyView from "@fastify/view";
import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import { Eta } from "eta";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import publicRoutes from "./routes/public/index.js";
import adminRoutes from "./routes/admin/index.js";
import { env } from "./config/env.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  // @fastify/static sólo avisa (no falla) si `root` no existe todavía, pero
  // serviría 404 para todo hasta la primera subida: se crea de antemano.
  await mkdir(path.resolve(process.cwd(), env.MEDIA_DIR), { recursive: true });

  await app.register(fastifyView, {
    engine: { eta: new Eta() },
    templates: path.join(process.cwd(), "src/views"),
  });

  await app.register(fastifyCookie);

  await app.register(fastifyStatic, {
    root: path.join(process.cwd(), "public"),
    prefix: "/",
  });

  // Bundle de esbuild del editor visual (T3 de docs/slices/05.md), aparte de
  // public/css/ para que el sitio público (invariante 3) nunca lo sirva ni
  // dependa de esta ruta. `decorateReply: false`: la primera instancia ya
  // agregó `reply.sendFile`, una segunda lo repetiría y @fastify/static tira.
  await app.register(fastifyStatic, {
    root: path.join(process.cwd(), "public/admin"),
    prefix: "/admin/static/",
    decorateReply: false,
  });

  // Tercera instancia, apuntando a MEDIA_DIR (docs/slices/07.md §0): caché
  // larga e immutable porque el nombre de archivo es estable para siempre —
  // volver a subir la misma foto crea una fila (y un id) nueva, nunca
  // reescribe un archivo ya publicado.
  await app.register(fastifyStatic, {
    root: path.resolve(process.cwd(), env.MEDIA_DIR),
    prefix: "/media/",
    decorateReply: false,
    cacheControl: true,
    maxAge: "365d",
    immutable: true,
  });

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

import Fastify, { type FastifyInstance } from "fastify";
import fastifyView from "@fastify/view";
import { Eta } from "eta";
import path from "node:path";
import publicRoutes from "./routes/public/index.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  await app.register(fastifyView, {
    engine: { eta: new Eta() },
    templates: path.join(process.cwd(), "src/views"),
  });

  app.get("/health", () => ({ status: "ok" }));

  await app.register(publicRoutes);

  return app;
}

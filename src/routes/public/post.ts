import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderMarkdown } from "../../markdown/pipeline.js";

export default function postRoutes(fastify: FastifyInstance): void {
  fastify.get<{ Params: { slug: string } }>("/:slug", async (request, reply) => {
    const { slug } = request.params;
    const filePath = path.join(process.cwd(), request.space.contentDir, `${slug}.md`);

    let markdown: string;
    try {
      markdown = await readFile(filePath, "utf-8");
    } catch {
      await reply.code(404).send();
      return;
    }

    const html = await renderMarkdown(markdown);

    await reply.view("post.eta", {
      title: slug,
      spaceName: request.space.name,
      html,
    });
  });
}

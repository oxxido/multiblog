import type { FastifyInstance } from "fastify";
import { z } from "zod";
import postgres from "postgres";
import {
  archiveSpace,
  createSpace,
  getSpace,
  listSpaces,
  updateSpace,
} from "../../modules/taxonomy/spaces.js";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MESSAGE = "Sólo minúsculas, números y guiones";

const spaceFormSchema = z.object({
  slug: z.string().min(1).regex(SLUG_PATTERN, SLUG_MESSAGE),
  subdomain: z.string().min(1).regex(SLUG_PATTERN, SLUG_MESSAGE),
  name: z.string().min(1),
  description: z.string().trim().transform((value) => (value.length > 0 ? value : null)),
  accentColor: z.string().trim().transform((value) => (value.length > 0 ? value : null)),
});

const idParamSchema = z.object({ id: z.uuid() });

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return error instanceof postgres.PostgresError && error.code === UNIQUE_VIOLATION;
}

export default function spaceRoutes(fastify: FastifyInstance): void {
  fastify.get("/", async (_request, reply) => {
    const items = await listSpaces();
    await reply.view("admin/spaces/list.eta", { items });
  });

  fastify.get("/new", async (_request, reply) => {
    await reply.view("admin/spaces/form.eta", { space: null, action: "/admin/espacios" });
  });

  fastify.post("/", async (request, reply) => {
    const parsed = spaceFormSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(parsed.error.message);
    }

    try {
      const { id } = await createSpace(parsed.data);
      return await reply.redirect(`/admin/espacios/${id}`);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.code(400).send("El slug o el subdominio ya están en uso");
      }
      throw error;
    }
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const space = await getSpace(id);

    if (!space) {
      return reply.code(404).send();
    }

    await reply.view("admin/spaces/form.eta", { space, action: `/admin/espacios/${id}` });
  });

  fastify.post<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const parsed = spaceFormSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(parsed.error.message);
    }

    try {
      await updateSpace(id, parsed.data);
      return await reply.redirect(`/admin/espacios/${id}`);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.code(400).send("El slug o el subdominio ya están en uso");
      }
      throw error;
    }
  });

  fastify.post<{ Params: { id: string } }>("/:id/archive", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await archiveSpace(id);
    return reply.redirect("/admin/espacios");
  });
}

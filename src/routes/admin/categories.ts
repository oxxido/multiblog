import type { FastifyInstance } from "fastify";
import { z } from "zod";
import postgres from "postgres";
import {
  createCategory,
  deleteCategory,
  getCategory,
  listCategories,
  updateCategory,
} from "../../modules/taxonomy/categories.js";
import { listActiveSpaceOptions } from "../../modules/taxonomy/spaces.js";

const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SLUG_MESSAGE = "Sólo minúsculas, números y guiones";

const categoryFormSchema = z.object({
  slug: z.string().min(1).regex(SLUG_PATTERN, SLUG_MESSAGE),
  name: z.string().min(1),
  description: z.string().trim().transform((value) => (value.length > 0 ? value : null)),
});

const newCategoryFormSchema = categoryFormSchema.extend({ spaceId: z.uuid() });

const idParamSchema = z.object({ id: z.uuid() });

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return error instanceof postgres.PostgresError && error.code === UNIQUE_VIOLATION;
}

export default function categoryRoutes(fastify: FastifyInstance): void {
  fastify.get("/", async (_request, reply) => {
    const items = await listCategories();
    await reply.view("admin/categories/list.eta", { items });
  });

  fastify.get("/new", async (_request, reply) => {
    const spaceOptions = await listActiveSpaceOptions();
    await reply.view("admin/categories/form.eta", {
      category: null,
      spaceOptions,
      action: "/admin/categorias",
    });
  });

  fastify.post("/", async (request, reply) => {
    const parsed = newCategoryFormSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(parsed.error.message);
    }

    const { spaceId, ...input } = parsed.data;

    try {
      const { id } = await createCategory(spaceId, input);
      return await reply.redirect(`/admin/categorias/${id}`);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.code(400).send("Ya existe una categoría con ese slug en ese espacio");
      }
      throw error;
    }
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const category = await getCategory(id);

    if (!category) {
      return reply.code(404).send();
    }

    await reply.view("admin/categories/form.eta", {
      category,
      spaceOptions: null,
      action: `/admin/categorias/${id}`,
    });
  });

  fastify.post<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const parsed = categoryFormSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(parsed.error.message);
    }

    try {
      await updateCategory(id, parsed.data);
      return await reply.redirect(`/admin/categorias/${id}`);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return reply.code(400).send("Ya existe una categoría con ese slug en ese espacio");
      }
      throw error;
    }
  });

  fastify.post<{ Params: { id: string } }>("/:id/delete", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await deleteCategory(id);
    return reply.redirect("/admin/categorias");
  });
}

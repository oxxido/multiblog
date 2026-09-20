import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  autosavePostBody,
  createPost,
  deletePost,
  getPost,
  listPosts,
  publishPost,
  updatePost,
} from "../../modules/content/posts.js";
import { listActiveSpaceOptions, listSpaceOptionsForPost } from "../../modules/taxonomy/spaces.js";
import { listCategories } from "../../modules/taxonomy/categories.js";
import { fromMarkdown } from "../../markdown/tiptap/fromMarkdown.js";

// Checkboxes repetidos llegan como array; ninguno tildado llega ausente.
function toArray(value: unknown): unknown[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

const categoryIdsField = z.preprocess(toArray, z.array(z.uuid()));

const slugField = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "El slug sólo admite minúsculas, números y guiones");

const excerptField = z.string().trim().transform((value) => (value.length > 0 ? value : null));

// Paso mínimo de creación (T5 de docs/slices/05.md): sin cuerpo ni
// categorías todavía. El post se crea con body_md vacío y se termina de
// escribir en /admin/posts/{id}, que ya es la pantalla de edición completa.
const newPostFormSchema = z.object({
  spaceId: z.uuid(),
  slug: slugField,
  title: z.string().min(1),
  excerpt: excerptField,
});

const editPostFormSchema = z.object({
  spaceId: z.uuid(),
  slug: slugField,
  title: z.string().min(1),
  excerpt: excerptField,
  bodyMd: z.string().min(1),
  categoryIds: categoryIdsField,
});

const autosaveBodySchema = z.object({ bodyMd: z.string() });

const idParamSchema = z.object({ id: z.uuid() });

export default function postRoutes(fastify: FastifyInstance): void {
  fastify.get("/", async (_request, reply) => {
    const items = await listPosts();
    await reply.view("admin/posts/list.eta", { items });
  });

  fastify.get("/new", async (_request, reply) => {
    const spaceOptions = await listActiveSpaceOptions();
    await reply.view("admin/posts/new.eta", { spaceOptions });
  });

  fastify.post("/", async (request, reply) => {
    const parsed = newPostFormSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(parsed.error.message);
    }

    const { id } = await createPost({ ...parsed.data, bodyMd: "", categoryIds: [] });
    return reply.redirect(`/admin/posts/${id}`);
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const post = await getPost(id);

    if (!post) {
      return reply.code(404).send();
    }

    const [spaceOptions, categoryOptions] = await Promise.all([
      listSpaceOptionsForPost(post.spaceId),
      listCategories(),
    ]);

    await reply.view("admin/posts/form.eta", {
      post,
      spaceOptions,
      categoryOptions,
      action: `/admin/posts/${id}`,
      initialDoc: fromMarkdown(post.bodyMd),
    });
  });

  fastify.post<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const parsed = editPostFormSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(parsed.error.message);
    }

    await updatePost(id, parsed.data);
    return reply.redirect(`/admin/posts/${id}`);
  });

  // Sólo toca body_md/body_html/updated_at (§0 de docs/slices/05.md): nunca
  // slug, title, status ni categorías, para que el autosave no pueda
  // publicar ni renombrar nada por accidente.
  fastify.post<{ Params: { id: string } }>("/:id/autosave", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const parsed = autosaveBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(parsed.error.message);
    }

    await autosavePostBody(id, parsed.data.bodyMd);
    return reply.code(204).send();
  });

  fastify.post<{ Params: { id: string } }>("/:id/publish", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await publishPost(id);
    return reply.redirect(`/admin/posts/${id}`);
  });

  fastify.post<{ Params: { id: string } }>("/:id/delete", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await deletePost(id);
    return reply.redirect("/admin/posts");
  });
}

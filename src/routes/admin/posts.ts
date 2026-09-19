import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createPost,
  deletePost,
  getPost,
  listPosts,
  publishPost,
  updatePost,
} from "../../modules/content/posts.js";
import { listActiveSpaceOptions, listSpaceOptionsForPost } from "../../modules/taxonomy/spaces.js";
import { listCategories } from "../../modules/taxonomy/categories.js";

// Checkboxes repetidos llegan como array; ninguno tildado llega ausente.
function toArray(value: unknown): unknown[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

const categoryIdsField = z.preprocess(toArray, z.array(z.uuid()));

const postFormSchema = z.object({
  spaceId: z.uuid(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "El slug sólo admite minúsculas, números y guiones"),
  title: z.string().min(1),
  excerpt: z.string().trim().transform((value) => (value.length > 0 ? value : null)),
  bodyMd: z.string().min(1),
  categoryIds: categoryIdsField,
});

const idParamSchema = z.object({ id: z.uuid() });

export default function postRoutes(fastify: FastifyInstance): void {
  fastify.get("/", async (_request, reply) => {
    const items = await listPosts();
    await reply.view("admin/posts/list.eta", { items });
  });

  fastify.get("/new", async (_request, reply) => {
    const [spaceOptions, categoryOptions] = await Promise.all([listActiveSpaceOptions(), listCategories()]);
    await reply.view("admin/posts/form.eta", {
      post: null,
      spaceOptions,
      categoryOptions,
      action: "/admin/posts",
    });
  });

  fastify.post("/", async (request, reply) => {
    const parsed = postFormSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(parsed.error.message);
    }

    const { id } = await createPost(parsed.data);
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
    });
  });

  fastify.post<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const parsed = postFormSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(parsed.error.message);
    }

    await updatePost(id, parsed.data);
    return reply.redirect(`/admin/posts/${id}`);
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

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createPost,
  deletePost,
  getPost,
  listPosts,
  listSpaceOptions,
  publishPost,
  updatePost,
} from "../../modules/content/posts.js";

const postFormSchema = z.object({
  spaceId: z.uuid(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "El slug sólo admite minúsculas, números y guiones"),
  title: z.string().min(1),
  excerpt: z.string().trim().transform((value) => (value.length > 0 ? value : null)),
  bodyMd: z.string().min(1),
});

const idParamSchema = z.object({ id: z.uuid() });

export default function postRoutes(fastify: FastifyInstance): void {
  fastify.get("/", async (_request, reply) => {
    const items = await listPosts();
    await reply.view("admin/posts/list.eta", { items });
  });

  fastify.get("/new", async (_request, reply) => {
    const spaceOptions = await listSpaceOptions();
    await reply.view("admin/posts/form.eta", {
      post: null,
      spaceOptions,
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
    const [post, spaceOptions] = await Promise.all([getPost(id), listSpaceOptions()]);

    if (!post) {
      return reply.code(404).send();
    }

    await reply.view("admin/posts/form.eta", {
      post,
      spaceOptions,
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

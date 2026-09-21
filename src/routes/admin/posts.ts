import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  autosavePostBody,
  cancelSchedule,
  createPost,
  deletePost,
  findTranslationSibling,
  getPost,
  listPosts,
  publishPost,
  rotatePreviewToken,
  schedulePost,
  updatePost,
} from "../../modules/content/posts.js";
import { diffAgainstPrevious, getRevision, listRevisions, recordRevisionIfChanged } from "../../modules/content/revisions.js";
import { getSpace, listActiveSpaceOptions, listSpaceOptionsForPost } from "../../modules/taxonomy/spaces.js";
import { listCategories } from "../../modules/taxonomy/categories.js";
import { parseTagNames } from "../../modules/taxonomy/tags.js";
import { fromMarkdown } from "../../markdown/tiptap/fromMarkdown.js";
import { resolveCoverImage } from "../../modules/media/media.js";
import { translatePost } from "../../modules/translation/translate.js";
import { previewUrlFor } from "../public/urls.js";

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

const coverMediaIdField = z.preprocess(
  (value) => (typeof value === "string" && value.trim().length > 0 ? value : null),
  z.uuid().nullable(),
);

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
  tags: z.string().default("").transform(parseTagNames),
  coverMediaId: coverMediaIdField,
});

const autosaveBodySchema = z.object({ bodyMd: z.string() });

const idParamSchema = z.object({ id: z.uuid() });

const scheduleFormSchema = z.object({
  publishAt: z
    .string()
    .min(1)
    .transform((value, ctx) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        ctx.addIssue({ code: "custom", message: "Fecha inválida" });
        return z.NEVER;
      }
      if (date.getTime() <= Date.now()) {
        ctx.addIssue({ code: "custom", message: "La fecha de programación debe ser futura" });
        return z.NEVER;
      }
      return date;
    }),
});

const postQuerySchema = z.object({ translateError: z.string().optional() });

export default function postRoutes(fastify: FastifyInstance): void {
  fastify.get("/", async (_request, reply) => {
    const items = await listPosts();
    const counts = {
      total: items.length,
      drafts: items.filter((item) => item.status === "draft").length,
      scheduled: items.filter((item) => item.status === "scheduled").length,
    };
    const spaceOptions = await listActiveSpaceOptions();
    await reply.view("admin/posts/list.eta", { items, counts, spaceOptions });
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

    const { id } = await createPost({ ...parsed.data, bodyMd: "", categoryIds: [], tagNames: [], coverMediaId: null });
    return reply.redirect(`/admin/posts/${id}`);
  });

  fastify.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const { translateError } = postQuerySchema.parse(request.query);
    const post = await getPost(id);

    if (!post) {
      return reply.code(404).send();
    }

    const [spaceOptions, categoryOptions, cover, sibling, space] = await Promise.all([
      listSpaceOptionsForPost(post.spaceId),
      listCategories(),
      resolveCoverImage(post.coverMediaId),
      findTranslationSibling(post.translationGroupId, id),
      getSpace(post.spaceId),
    ]);

    if (!space) {
      throw new Error(`Post ${id} sin espacio`);
    }

    const siblingIsStale =
      post.lang === "es" && sibling !== null && sibling.translatedAt !== null && post.updatedAt > sibling.translatedAt;

    await reply.view("admin/posts/form.eta", {
      post,
      space,
      spaceOptions,
      categoryOptions,
      cover,
      sibling,
      siblingIsStale,
      translateError: translateError ?? null,
      action: `/admin/posts/${id}`,
      initialDoc: fromMarkdown(post.bodyMd),
      previewUrl: previewUrlFor(request, space.subdomain, post.previewToken),
    });
  });

  fastify.post<{ Params: { id: string } }>("/:id", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const parsed = editPostFormSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(parsed.error.message);
    }

    const { tags: tagNames, ...rest } = parsed.data;
    await updatePost(id, { ...rest, tagNames });
    // Sólo acá, nunca en /autosave (§0 de docs/slices/10.md): una revisión
    // por guardado explícito del formulario completo, si el cuerpo cambió.
    await recordRevisionIfChanged(id, rest.bodyMd);
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

  fastify.post<{ Params: { id: string } }>("/:id/translate", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);

    try {
      const { id: translatedId } = await translatePost(id);
      return await reply.redirect(`/admin/posts/${translatedId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo traducir el post";
      return reply.redirect(`/admin/posts/${id}?translateError=${encodeURIComponent(message)}`);
    }
  });

  fastify.post<{ Params: { id: string } }>("/:id/publish", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await publishPost(id);
    return reply.redirect(`/admin/posts/${id}`);
  });

  fastify.post<{ Params: { id: string } }>("/:id/schedule", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const parsed = scheduleFormSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(parsed.error.message);
    }

    await schedulePost(id, parsed.data.publishAt);
    return reply.redirect(`/admin/posts/${id}`);
  });

  fastify.post<{ Params: { id: string } }>("/:id/cancel-schedule", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await cancelSchedule(id);
    return reply.redirect(`/admin/posts/${id}`);
  });

  fastify.post<{ Params: { id: string } }>("/:id/rotate-preview-token", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await rotatePreviewToken(id);
    return reply.redirect(`/admin/posts/${id}`);
  });

  fastify.get<{ Params: { id: string } }>("/:id/revisions", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const post = await getPost(id);
    if (!post) {
      return reply.code(404).send();
    }

    const revisions = await listRevisions(id);
    await reply.view("admin/posts/revisions.eta", { post, revisions });
  });

  const revisionParamsSchema = z.object({ id: z.uuid(), revisionId: z.uuid() });

  fastify.get<{ Params: { id: string; revisionId: string } }>(
    "/:id/revisions/:revisionId/diff",
    async (request, reply) => {
      const { id, revisionId } = revisionParamsSchema.parse(request.params);

      const [post, revision] = await Promise.all([getPost(id), getRevision(revisionId)]);
      if (!post || !revision || revision.postId !== id) {
        return reply.code(404).send();
      }

      const diffHtml = await diffAgainstPrevious(revisionId);
      await reply.view("admin/posts/revision-diff.eta", { post, revision, diffHtml });
    },
  );

  fastify.post<{ Params: { id: string } }>("/:id/delete", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await deletePost(id);
    return reply.redirect("/admin/posts");
  });
}

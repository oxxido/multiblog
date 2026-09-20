import type { FastifyInstance } from "fastify";
import { z } from "zod";
import multipart from "@fastify/multipart";
import { deleteMedia, findMediaUsage, getMedia, listMedia, MediaValidationError, uploadMedia } from "../../modules/media/media.js";
import { buildThumbnail } from "../../modules/media/derivatives.js";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const idParamSchema = z.object({ id: z.uuid() });
const pickerQuerySchema = z.object({ mode: z.enum(["single", "multi"]).default("single") });

function toThumbnail(item: { id: string; width: number | null }): { thumbnail: string } {
  return { thumbnail: buildThumbnail(item.id, item.width) };
}

export default async function mediaRoutes(fastify: FastifyInstance): Promise<void> {
  await fastify.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES } });

  fastify.get("/", async (_request, reply) => {
    const items = await listMedia();
    await reply.view("admin/media/list.eta", {
      items: items.map((item) => ({ ...item, ...toThumbnail(item) })),
    });
  });

  fastify.post("/", async (request, reply) => {
    const file = await request.file();
    if (!file) {
      return reply.code(400).send("Falta el archivo");
    }

    const buffer = await file.toBuffer();
    if (file.file.truncated) {
      return reply.code(400).send("El archivo supera el tamaño máximo (15 MB)");
    }

    try {
      await uploadMedia(buffer, file.filename, file.mimetype);
    } catch (error) {
      if (error instanceof MediaValidationError) {
        return reply.code(400).send(error.message);
      }
      throw error;
    }

    return reply.redirect("/admin/media");
  });

  fastify.get<{ Params: { id: string } }>("/:id/delete", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    const item = await getMedia(id);
    if (!item) {
      return reply.code(404).send();
    }

    const usages = await findMediaUsage(id);
    await reply.view("admin/media/confirm-delete.eta", { item: { ...item, ...toThumbnail(item) }, usages });
  });

  fastify.post<{ Params: { id: string } }>("/:id/delete", async (request, reply) => {
    const { id } = idParamSchema.parse(request.params);
    await deleteMedia(id);
    return reply.redirect("/admin/media");
  });

  // Misma grilla del listado, servida en una ventana propia que el editor
  // (T9) abre con window.open(): al elegir, postMessage a quien la abrió y
  // se cierra sola (docs/slices/07.md §0). No hay POST acá — la selección
  // nunca vuelve al servidor.
  fastify.get("/picker", async (request, reply) => {
    const { mode } = pickerQuerySchema.parse(request.query);
    const items = await listMedia();
    await reply.view("admin/media/picker.eta", {
      mode,
      items: items.map((item) => ({ ...item, ...toThumbnail(item) })),
    });
  });
}

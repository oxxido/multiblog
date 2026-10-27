import type { FastifyInstance } from "fastify";
import { z } from "zod";
import multipart from "@fastify/multipart";
import {
  deleteMedia,
  findMediaUsage,
  getMedia,
  listMedia,
  MediaValidationError,
  uploadMedia,
  type MediaSummary,
} from "../../modules/media/media.js";
import { buildThumbnail } from "../../modules/media/derivatives.js";

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const idParamSchema = z.object({ id: z.uuid() });

function toThumbnail(item: { id: string; width: number | null }): { thumbnail: string } {
  return { thumbnail: buildThumbnail(item.id, item.width) };
}

// Forma que consume el panel de selección del cliente (admin-client/mediaPanel.ts).
function toPanelItem(item: MediaSummary): {
  id: string;
  path: string;
  width: number;
  height: number;
  filename: string;
  thumbnail: string;
} {
  return {
    id: item.id,
    path: item.path,
    width: item.width ?? 0,
    height: item.height ?? 0,
    filename: item.filename,
    thumbnail: buildThumbnail(item.id, item.width),
  };
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

    let buffer: Buffer;
    try {
      buffer = await file.toBuffer();
    } catch (error) {
      // @fastify/multipart corta el stream y rechaza con FST_REQ_FILE_TOO_LARGE
      // en vez de resolver con un buffer truncado, ya que se registró con el
      // mismo límite que valida uploadMedia (defensa en profundidad: acá se
      // aplica ni bien el archivo entra, sin bufferearlo entero primero).
      if ((error as { code?: string }).code === "FST_REQ_FILE_TOO_LARGE") {
        return reply.code(400).send("El archivo supera el tamaño máximo (15 MB)");
      }
      throw error;
    }

    let uploaded: { id: string };
    try {
      uploaded = await uploadMedia(buffer, file.filename, file.mimetype);
    } catch (error) {
      if (error instanceof MediaValidationError) {
        return reply.code(400).send(error.message);
      }
      throw error;
    }

    // El panel de selección sube con fetch y necesita la imagen recién creada
    // para elegirla en la misma acción; el formulario de /admin/media sigue
    // redirigiendo al listado.
    if (request.headers.accept?.includes("application/json")) {
      const item = await getMedia(uploaded.id);
      if (!item) {
        throw new Error("La imagen subida no se encuentra");
      }
      return reply.send(toPanelItem(item));
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

  // Alimenta el panel de selección que se abre en la misma página (portadas y
  // botones "Imagen"/"Galería" del editor); la selección nunca vuelve al
  // servidor.
  fastify.get("/items", async (_request, reply) => {
    const items = await listMedia();
    return reply.send(items.map(toPanelItem));
  });
}

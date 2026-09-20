import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import { desc, eq, like } from "drizzle-orm";
import { db } from "../../db/client.js";
import { media, posts, siteSettings, spaces } from "../../db/schema.js";
import { widthsFor } from "./derivatives.js";
import { derivativeFilePath, generateDerivatives, originalFilePath } from "./storage.js";

const ACCEPTED_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

// Constante de código, no env (docs/slices/07.md §0): no hay necesidad de
// que varíe por entorno.
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const LIST_LIMIT = 200;

export class MediaValidationError extends Error {}

export interface MediaSummary {
  id: string;
  filename: string;
  mime: string;
  width: number | null;
  height: number | null;
  size: number;
  createdAt: Date;
}

const summaryColumns = {
  id: media.id,
  filename: media.filename,
  mime: media.mime,
  width: media.width,
  height: media.height,
  size: media.size,
  createdAt: media.createdAt,
};

export async function listMedia(): Promise<MediaSummary[]> {
  return db.select(summaryColumns).from(media).orderBy(desc(media.createdAt)).limit(LIST_LIMIT);
}

export async function getMedia(id: string): Promise<MediaSummary | null> {
  const [row] = await db.select(summaryColumns).from(media).where(eq(media.id, id)).limit(1);
  return row ?? null;
}

export async function uploadMedia(buffer: Buffer, filename: string, mime: string): Promise<{ id: string }> {
  const ext = ACCEPTED_MIME_TO_EXT[mime];
  if (!ext) {
    throw new MediaValidationError(`Tipo de archivo no admitido: ${mime}`);
  }
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new MediaValidationError("El archivo supera el tamaño máximo (15 MB)");
  }

  const id = randomUUID();
  const { width, height } = await generateDerivatives(buffer, id, ext);

  const [row] = await db
    .insert(media)
    .values({ id, filename, path: `${id}.${ext}`, mime, width, height, size: buffer.byteLength })
    .returning({ id: media.id });

  if (!row) {
    throw new Error("No se pudo subir la imagen");
  }

  return row;
}

export interface MediaUsage {
  label: string;
}

// Dos tipos de uso (docs/slices/07.md §0): estructurado (cover_media_id de
// posts/spaces/site_settings) y por texto (una imagen suelta en el cuerpo o
// dentro de un gallery no deja ninguna fila de relación, sólo la URL cruda
// en body_md).
export async function findMediaUsage(id: string): Promise<MediaUsage[]> {
  const usages: MediaUsage[] = [];

  const coverSpaces = await db.select({ name: spaces.name }).from(spaces).where(eq(spaces.coverMediaId, id));
  usages.push(...coverSpaces.map((space) => ({ label: `portada del espacio ${space.name}` })));

  const coverPosts = await db.select({ title: posts.title }).from(posts).where(eq(posts.coverMediaId, id));
  usages.push(...coverPosts.map((post) => ({ label: `portada del post ${post.title}` })));

  const [siteRow] = await db
    .select({ id: siteSettings.id })
    .from(siteSettings)
    .where(eq(siteSettings.coverMediaId, id))
    .limit(1);
  if (siteRow) {
    usages.push({ label: "portada del sitio" });
  }

  const bodyPosts = await db
    .select({ title: posts.title })
    .from(posts)
    .where(like(posts.bodyMd, `%/media/${id}%`));
  usages.push(...bodyPosts.map((post) => ({ label: `cuerpo del post ${post.title}` })));

  return usages;
}

export async function deleteMedia(id: string): Promise<void> {
  const [row] = await db.select({ path: media.path, width: media.width }).from(media).where(eq(media.id, id)).limit(1);

  if (!row) {
    return;
  }

  await db.delete(media).where(eq(media.id, id));

  const ext = path.extname(row.path).slice(1);
  const derivativePaths = row.width ? widthsFor(row.width).map((width) => derivativeFilePath(id, width)) : [];

  await Promise.all(
    [originalFilePath(id, ext), ...derivativePaths].map((filePath) => unlink(filePath).catch(() => undefined)),
  );
}

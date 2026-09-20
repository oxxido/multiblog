import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "../../config/env.js";
import { widthsFor } from "./derivatives.js";

export function derivativeFilePath(id: string, width: number): string {
  return path.join(env.MEDIA_DIR, `${id}-${String(width)}.webp`);
}

export function originalFilePath(id: string, ext: string): string {
  return path.join(env.MEDIA_DIR, `${id}.${ext}`);
}

// Lee las dimensiones del original con sharp, lo escribe tal cual a
// MEDIA_DIR (SPEC.md §8: el original se conserva para pg_dump + volumen,
// nunca se enlaza desde HTML) y escribe un .webp por cada ancho aplicable.
export async function generateDerivatives(
  buffer: Buffer,
  id: string,
  ext: string,
): Promise<{ width: number; height: number }> {
  const image = sharp(buffer);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error(`No se pudieron leer las dimensiones de la imagen ${id}`);
  }
  const { width, height } = metadata;

  await mkdir(env.MEDIA_DIR, { recursive: true });
  await writeFile(originalFilePath(id, ext), buffer);

  for (const derivativeWidth of widthsFor(width)) {
    await image.clone().resize({ width: derivativeWidth }).webp().toFile(derivativeFilePath(id, derivativeWidth));
  }

  return { width, height };
}

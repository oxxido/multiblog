import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { env } from "../../config/env.js";

// Anchos de derivado fijos en código (docs/slices/07.md §0): desde el frame
// más chico de `gallery` a 4 columnas hasta una cabecera a sangre en un
// monitor grande. Nunca se agranda un original.
const MIN_WIDTH = 320;
export const DERIVATIVE_WIDTHS = [MIN_WIDTH, 640, 960, 1280, 1920];

const MEDIA_URL_PATTERN = /^\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.[a-z0-9]+$/i;

// Un original más angosto que el mínimo de la lista genera un único
// derivado a su propio ancho (nunca upscale, docs/slices/07.md §0); en
// cualquier otro caso, todo ancho de la lista que sea ≤ al ancho original.
export function widthsFor(originalWidth: number): number[] {
  const applicable = DERIVATIVE_WIDTHS.filter((width) => width <= originalWidth);
  return applicable.length > 0 ? applicable : [originalWidth];
}

function derivativePath(id: string, width: number): string {
  return `/media/${id}-${String(width)}.webp`;
}

export interface MediaDimensions {
  id: string;
  width: number;
  height: number;
}

export interface ResponsiveImage {
  src: string;
  srcset: string;
  width: number;
  height: number;
}

// Pura, sin I/O: dado un ancho/alto ya conocidos (de `media`), calcula qué
// derivados le corresponden. El `src` es el derivado más grande disponible;
// el navegador elige entre los del `srcset` (docs/slices/07.md §0).
export function buildResponsiveImage({ id, width, height }: MediaDimensions): ResponsiveImage {
  const widths = widthsFor(width);
  const largest = widths[widths.length - 1];
  if (largest === undefined) {
    throw new Error(`No se pudo calcular un derivado para la imagen ${id}`);
  }

  return {
    src: derivativePath(id, largest),
    srcset: widths.map((derivativeWidth) => `${derivativePath(id, derivativeWidth)} ${String(derivativeWidth)}w`).join(", "),
    width,
    height,
  };
}

// El derivado más chico disponible: lo que usa el admin para miniaturas de
// listado/picker (T4), donde importa el peso de la grilla, no la nitidez.
export function buildThumbnail(id: string, originalWidth: number | null): string {
  const widths = widthsFor(originalWidth ?? MIN_WIDTH);
  return derivativePath(id, widths[0] ?? MIN_WIDTH);
}

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

// Extrae el uuid de una URL `/media/{id}.ext`, o null si no matchea
// (imagen externa, o una forma de URL distinta) — usado por el plugin
// remark de enriquecimiento (T6) para decidir si vale la pena consultar
// `media`.
export function parseMediaUrl(url: string): string | null {
  return MEDIA_URL_PATTERN.exec(url)?.[1] ?? null;
}

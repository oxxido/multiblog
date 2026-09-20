import OpenAI from "openai";
import { z } from "zod";
import { env } from "../../config/env.js";

const MODEL = "openrouter/auto";

const SYSTEM_PROMPT = `Traducís posts de un blog del español al inglés. Reglas, sin excepción:

- entra Markdown, sale Markdown;
- las directivas de bloque no se tocan: ":::gallery{cols=3}" sale idéntica, carácter por carácter, incluidos sus atributos — sólo se traduce el texto que va DENTRO del bloque;
- los bloques de código no se traducen, ni siquiera sus comentarios;
- las rutas de imagen y los enlaces internos se conservan literales;
- el atributo "alt" de las imágenes sí se traduce;
- mantené el tono y el registro del original; no "mejores" el texto ni agregues ni saques contenido;
- el título y el extracto se traducen; proponé un slug en inglés a partir del título traducido (minúsculas, palabras separadas por guiones, sin acentos ni caracteres especiales).

Respondé ÚNICAMENTE con un objeto JSON, sin fences de Markdown ni texto alrededor, con exactamente estas claves: "title", "excerpt", "slug", "bodyMd". Si no hay extracto que traducir, "excerpt" es un string vacío.`;

const responseSchema = z.object({
  title: z.string(),
  excerpt: z.string(),
  slug: z.string(),
  bodyMd: z.string(),
});

export interface TranslateContentInput {
  title: string;
  excerpt: string | null;
  bodyMd: string;
}

export interface TranslateContentResult {
  title: string;
  excerpt: string | null;
  slug: string;
  bodyMd: string;
}

function extractJson(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    throw new Error("La respuesta del traductor no es un JSON válido");
  }
}

export async function translateContent(input: TranslateContentInput): Promise<TranslateContentResult> {
  if (!env.OPENROUTER_API_KEY) {
    throw new Error("Falta OPENROUTER_API_KEY: la traducción no está disponible");
  }

  const client = new OpenAI({
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1",
  });

  const userPayload = JSON.stringify({
    title: input.title,
    excerpt: input.excerpt ?? "",
    bodyMd: input.bodyMd,
  });

  const completion = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPayload },
    ],
  });

  const content = completion.choices[0]?.message.content;
  if (!content) {
    throw new Error("El traductor no devolvió contenido");
  }

  const parsed = responseSchema.safeParse(extractJson(content));
  if (!parsed.success) {
    throw new Error("La respuesta del traductor no tiene la forma esperada");
  }

  return {
    title: parsed.data.title,
    excerpt: parsed.data.excerpt.length > 0 ? parsed.data.excerpt : null,
    slug: parsed.data.slug,
    bodyMd: parsed.data.bodyMd,
  };
}

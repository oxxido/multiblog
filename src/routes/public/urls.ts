import type { FastifyRequest } from "fastify";
import { env } from "../../config/env.js";

// Mismo esquema y puerto de la petición entrante para no asumir un dominio
// fijo (.claude/rules/Db.md): estos helpers arman URLs absolutas a partir de
// BASE_DOMAIN, nunca de un host escrito a mano.
function portSuffix(request: FastifyRequest): string {
  const host = request.headers.host ?? "";
  const port = host.split(":")[1];
  return port ? `:${port}` : "";
}

export function centralUrlFor(request: FastifyRequest, lang: "es" | "en"): string {
  const suffix = lang === "en" ? "/en" : "";
  return `${request.protocol}://${env.BASE_DOMAIN}${portSuffix(request)}${suffix}`;
}

export function spaceUrlFor(request: FastifyRequest, subdomain: string, lang: "es" | "en"): string {
  const suffix = lang === "en" ? "/en" : "";
  return `${request.protocol}://${subdomain}.${env.BASE_DOMAIN}${portSuffix(request)}${suffix}`;
}

// Un post y su hermano de traducción viven siempre en el mismo espacio
// (docs/I18N.md §1): alcanza con cambiar el prefijo /en, nunca el subdominio.
export function postAbsoluteUrlFor(
  request: FastifyRequest,
  subdomain: string,
  postLang: "es" | "en",
  slug: string,
): string {
  const suffix = postLang === "en" ? "/en" : "";
  return `${request.protocol}://${subdomain}${portSuffix(request)}${suffix}/${slug}`;
}

// El sitio de media es el mismo para cualquier host que sirva la petición
// (una sola instancia de @fastify/static bajo /media/): a diferencia de los
// otros helpers, usa el host de la petición entrante tal cual, no BASE_DOMAIN
// ni el subdominio de un espacio.
export function absoluteMediaUrl(request: FastifyRequest, mediaPath: string): string {
  const host = request.headers.host ?? env.BASE_DOMAIN;
  return `${request.protocol}://${host}${mediaPath}`;
}

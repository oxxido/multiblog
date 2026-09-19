import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../config/env.js";
import { resolveSpace, type SpaceConfig } from "../config/spaces.js";

declare module "fastify" {
  interface FastifyRequest {
    space: SpaceConfig;
  }
}

function subdomainFor(host: string, baseDomain: string): string | null {
  const hostname = host.split(":")[0] ?? "";
  const suffix = `.${baseDomain}`;
  if (hostname === baseDomain || !hostname.endsWith(suffix)) {
    return null;
  }
  return hostname.slice(0, -suffix.length);
}

export async function resolveSpaceMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const host = request.headers.host ?? "";
  const subdomain = subdomainFor(host, env.BASE_DOMAIN);
  const space = subdomain ? resolveSpace(subdomain) : undefined;

  if (!space) {
    await reply.code(404).send();
    return;
  }

  request.space = space;
}

import type { FastifyReply, FastifyRequest } from "fastify";
import { and, eq, isNull } from "drizzle-orm";
import { env } from "../config/env.js";
import { db } from "../db/client.js";
import { spaces } from "../db/schema.js";

export type ResolvedSpace = typeof spaces.$inferSelect;

declare module "fastify" {
  interface FastifyRequest {
    space: ResolvedSpace;
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

async function resolveSpace(subdomain: string): Promise<ResolvedSpace | undefined> {
  const [space] = await db
    .select()
    .from(spaces)
    .where(and(eq(spaces.subdomain, subdomain), isNull(spaces.archivedAt)))
    .limit(1);

  return space;
}

export async function resolveSpaceMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const host = request.headers.host ?? "";
  const subdomain = subdomainFor(host, env.BASE_DOMAIN);
  const space = subdomain ? await resolveSpace(subdomain) : undefined;

  if (!space) {
    await reply.code(404).send();
    return;
  }

  request.space = space;
}

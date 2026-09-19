import type { FastifyReply, FastifyRequest } from "fastify";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { sessions, users } from "../db/schema.js";

export const SESSION_COOKIE = "session";
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

declare module "fastify" {
  interface FastifyRequest {
    user: { id: string; email: string };
  }
}

export async function requireSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sessionId = request.cookies[SESSION_COOKIE];
  const user = sessionId ? await findUserBySession(sessionId) : null;

  if (!user) {
    await reply.redirect("/admin/login");
    return;
  }

  request.user = user;
}

async function findUserBySession(sessionId: string): Promise<{ id: string; email: string } | null> {
  const [row] = await db
    .select({ expiresAt: sessions.expiresAt, userId: users.id, userEmail: users.email })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, sessionId))
    .limit(1);

  if (!row || row.expiresAt.getTime() <= Date.now()) {
    return null;
  }

  return { id: row.userId, email: row.userEmail };
}

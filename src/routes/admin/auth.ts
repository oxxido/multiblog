import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/client.js";
import { sessions, users } from "../../db/schema.js";
import { verifyPassword } from "../../modules/auth/password.js";
import { SESSION_COOKIE, SESSION_TTL_MS } from "../../middleware/auth.js";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

const loginQuerySchema = z.object({ error: z.string().optional() });

export default function authRoutes(fastify: FastifyInstance): void {
  fastify.get("/login", async (request, reply) => {
    const query = loginQuerySchema.parse(request.query);
    await reply.view("admin/login.eta", { error: Boolean(query.error) });
  });

  fastify.post("/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.redirect("/admin/login?error=1");
    }

    const [user] = await db
      .select({ id: users.id, email: users.email, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, parsed.data.email))
      .limit(1);

    if (!user || !verifyPassword(parsed.data.password, user.passwordHash)) {
      return reply.redirect("/admin/login?error=1");
    }

    const sessionId = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await db.insert(sessions).values({ id: sessionId, userId: user.id, expiresAt });

    return reply
      .setCookie(SESSION_COOKIE, sessionId, {
        httpOnly: true,
        secure: request.protocol === "https",
        sameSite: "lax",
        path: "/",
        expires: expiresAt,
      })
      .redirect("/admin");
  });

  fastify.post("/logout", async (request, reply) => {
    const sessionId = request.cookies[SESSION_COOKIE];
    if (sessionId) {
      await db.delete(sessions).where(eq(sessions.id, sessionId));
    }
    return reply.clearCookie(SESSION_COOKIE, { path: "/" }).redirect("/admin/login");
  });
}

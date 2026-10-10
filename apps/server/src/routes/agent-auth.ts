import { Hono } from "hono";
import { z } from "zod";
import { clientIp, limit, readBody, type AppEnv } from "../app-env";
import type { AgentRow } from "../db/rows";
import { toAgent } from "../db/serialize";
import { constantTimeEqual, DUMMY_PASSWORD_HASH, hashPassword, sha256, verifyPassword } from "../lib/crypto";
import { badRequest, conflict, forbidden, notFound, unauthorized } from "../lib/errors";
import { newId } from "../lib/ids";
import { assertTrustedOrigin, endAgentSession, startAgentSession } from "../lib/agent-session";

export const passwordSchema = z.string().min(10, "Use at least 10 characters").max(200);
const nameSchema = z.string().trim().min(1).max(80);

const setupSchema = z.object({
  setupToken: z.string().min(1).max(200),
  name: nameSchema,
  email: z.email().max(254),
  password: passwordSchema,
});
const loginSchema = z.object({ email: z.email().max(254), password: z.string().min(1).max(200) });
const acceptSchema = z.object({ name: nameSchema, password: passwordSchema });

export const agentAuthRoutes = new Hono<AppEnv>();

agentAuthRoutes.use("*", async (c, next) => {
  assertTrustedOrigin(c);
  return next();
});

agentAuthRoutes.get("/status", async (c) => {
  const row = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM agents").first<{ n: number }>();
  return c.json({ needsSetup: (row?.n ?? 0) === 0 });
});

/** Creates the first owner. Needs SETUP_TOKEN and works only while there are no agents. */
agentAuthRoutes.post("/setup", async (c) => {
  await limit(c.env.AUTH_LIMITER, `setup:${clientIp(c)}`);
  const input = await readBody(c, setupSchema);
  if (!c.env.SETUP_TOKEN || !constantTimeEqual(input.setupToken, c.env.SETUP_TOKEN)) {
    throw forbidden("Wrong setup token");
  }
  const id = newId("agt");
  const result = await c.env.DB.prepare(
    `INSERT INTO agents (id, email, name, role, password_hash, created_at)
     SELECT ?, ?, ?, 'owner', ?, ? WHERE NOT EXISTS (SELECT 1 FROM agents)`,
  )
    .bind(id, input.email.toLowerCase(), input.name, await hashPassword(input.password), Date.now())
    .run();
  if (!result.meta.changes) throw conflict("Setup is already done");
  await startAgentSession(c, id);
  const agent = await c.env.DB.prepare("SELECT * FROM agents WHERE id = ?").bind(id).first<AgentRow>();
  return c.json({ agent: toAgent(agent!) }, 201);
});

agentAuthRoutes.post("/login", async (c) => {
  const input = await readBody(c, loginSchema);
  const email = input.email.toLowerCase();
  await limit(c.env.AUTH_LIMITER, `login:${clientIp(c)}:${email}`);
  // Also per account, whatever the IP, so spreading guesses over many IPs doesn't help.
  await limit(c.env.AUTH_LIMITER, `login-account:${email}`);
  const agent = await c.env.DB.prepare("SELECT * FROM agents WHERE email = ? AND disabled_at IS NULL")
    .bind(email)
    .first<AgentRow>();
  // Always hash, so the response time doesn't reveal which emails exist.
  const valid = await verifyPassword(input.password, agent?.password_hash ?? DUMMY_PASSWORD_HASH);
  if (!agent || !valid) throw unauthorized("Wrong email or password");
  await startAgentSession(c, agent.id);
  return c.json({ agent: toAgent(agent) });
});

agentAuthRoutes.post("/logout", async (c) => {
  await endAgentSession(c);
  return c.json({ ok: true });
});

async function findInvite(db: D1Database, token: string) {
  return db
    .prepare(
      `SELECT i.* FROM agent_invites i JOIN agents a ON a.id = i.created_by
       WHERE i.token_hash = ? AND i.accepted_at IS NULL AND i.expires_at > ?
         AND a.role = 'owner' AND a.disabled_at IS NULL`,
    )
    .bind(await sha256(token), Date.now())
    .first<{ id: string; email: string; role: "owner" | "agent" }>();
}

agentAuthRoutes.get("/invites/:token", async (c) => {
  await limit(c.env.AUTH_LIMITER, `invite:${clientIp(c)}`);
  const invite = await findInvite(c.env.DB, c.req.param("token"));
  if (!invite) throw notFound("This invite is invalid or has expired");
  return c.json({ email: invite.email, role: invite.role });
});

agentAuthRoutes.post("/invites/:token/accept", async (c) => {
  await limit(c.env.AUTH_LIMITER, `invite:${clientIp(c)}`);
  const invite = await findInvite(c.env.DB, c.req.param("token"));
  if (!invite) throw notFound("This invite is invalid or has expired");
  const input = await readBody(c, acceptSchema);
  const existing = await c.env.DB.prepare("SELECT id FROM agents WHERE email = ?").bind(invite.email).first();
  if (existing) throw badRequest("An account with this email already exists");
  const id = newId("agt");
  const now = Date.now();
  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO agents (id, email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(id, invite.email.toLowerCase(), input.name, invite.role, await hashPassword(input.password), now),
    c.env.DB.prepare("UPDATE agent_invites SET accepted_at = ? WHERE id = ?").bind(now, invite.id),
  ]);
  await startAgentSession(c, id);
  const agent = await c.env.DB.prepare("SELECT * FROM agents WHERE id = ?").bind(id).first<AgentRow>();
  return c.json({ agent: toAgent(agent!) }, 201);
});

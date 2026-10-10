import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { AppContext } from "../app-env";
import type { AgentRow } from "../db/rows";
import { randomToken, sha256 } from "./crypto";
import { forbidden, unauthorized } from "./errors";
import { inboxHub } from "./realtime";

const SESSION_DAYS = 14;
/** Sessions slide while used, but never live longer than this. */
const SESSION_MAX_DAYS = 90;
const DAY_MS = 24 * 3600 * 1000;

function isSecure(c: AppContext): boolean {
  return new URL(c.req.url).protocol === "https:";
}

/** `__Host-` pins the cookie to this exact origin over HTTPS; plain name for http://localhost. */
function cookieName(c: AppContext): string {
  return isSecure(c) ? "__Host-ys_session" : "ys_session";
}

export async function startAgentSession(c: AppContext, agentId: string): Promise<void> {
  const token = randomToken(32);
  const now = Date.now();
  await c.env.DB.prepare(
    "INSERT INTO agent_sessions (token_hash, agent_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)",
  )
    .bind(await sha256(token), agentId, now, now + SESSION_DAYS * DAY_MS, (c.req.header("user-agent") ?? "").slice(0, 200))
    .run();
  setCookie(c, cookieName(c), token, {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: "Strict",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}

export async function endAgentSession(c: AppContext): Promise<void> {
  const token = getCookie(c, cookieName(c));
  if (token) {
    const hash = await sha256(token);
    await c.env.DB.prepare("DELETE FROM agent_sessions WHERE token_hash = ?").bind(hash).run();
    await inboxHub(c.env).disconnectSession(hash);
  }
  deleteCookie(c, cookieName(c), { path: "/", secure: isSecure(c) });
}

export async function currentAgent(c: AppContext): Promise<AgentRow | null> {
  const token = getCookie(c, cookieName(c));
  if (!token) return null;
  const hash = await sha256(token);
  const row = await c.env.DB.prepare(
    `SELECT a.*, s.expires_at AS session_expires_at FROM agent_sessions s JOIN agents a ON a.id = s.agent_id
     WHERE s.token_hash = ? AND s.expires_at > ? AND s.created_at > ? AND a.disabled_at IS NULL`,
  )
    .bind(hash, Date.now(), Date.now() - SESSION_MAX_DAYS * DAY_MS)
    .first<AgentRow & { session_expires_at: number }>();
  if (!row) return null;

  const now = Date.now();
  // Sliding expiry, and a "last seen" that is accurate to a few minutes.
  if (row.session_expires_at - now < (SESSION_DAYS - 1) * DAY_MS) {
    c.executionCtx.waitUntil(
      c.env.DB.prepare("UPDATE agent_sessions SET expires_at = ? WHERE token_hash = ?")
        .bind(now + SESSION_DAYS * DAY_MS, hash)
        .run(),
    );
  }
  if (!row.last_seen_at || now - row.last_seen_at > 5 * 60_000) {
    c.executionCtx.waitUntil(c.env.DB.prepare("UPDATE agents SET last_seen_at = ? WHERE id = ?").bind(now, row.id).run());
  }
  const { session_expires_at: _, ...agent } = row;
  c.set("sessionHash", hash);
  return agent;
}

/**
 * Cookie auth needs CSRF protection: SameSite=Strict does most of it, and we also require the
 * request to come from this origin (or a dev server listed in DEV_ORIGINS).
 */
export function assertTrustedOrigin(c: AppContext): void {
  const origin = c.req.header("origin");
  if (!origin) {
    if (c.req.method === "GET" || c.req.method === "HEAD") return;
    throw forbidden("Missing origin");
  }
  const own = new URL(c.req.url).origin;
  const dev = (c.env.DEV_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  if (origin !== own && !dev.includes(origin)) throw forbidden("Untrusted origin");
}

export async function requireAgent(c: AppContext): Promise<AgentRow> {
  const agent = await currentAgent(c);
  if (!agent) throw unauthorized();
  return agent;
}

export function requireOwner(agent: AgentRow): void {
  if (agent.role !== "owner") throw forbidden("Only owners can do this");
}

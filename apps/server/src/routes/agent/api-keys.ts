import { Hono } from "hono";
import { z } from "zod";
import { API_SCOPES, type CreatedApiKey } from "yunidesk";
import { readBody, type AppEnv } from "../../app-env";
import type { AgentRow } from "../../db/rows";
import { displayPrefix, generateApiKey, hashApiKey, toApiKey, type ApiKeyRow } from "../../lib/api-keys";
import { audit } from "../../lib/audit";
import { requirePermission } from "../../lib/permissions";
import { hashPassword, randomToken } from "../../lib/crypto";
import { conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";

const createSchema = z.object({
  name: z.string().trim().min(1).max(60),
  /** Shown on replies sent with this key; defaults to the key name. */
  botName: z.string().trim().min(1).max(60).optional(),
  scopes: z.array(z.enum(API_SCOPES)).min(1).max(API_SCOPES.length),
  /** Days until it expires; null never expires. */
  expiresInDays: z.number().int().min(1).max(730).nullable().default(null),
});

const MAX_ACTIVE_KEYS = 50;
const DAY_MS = 24 * 3600 * 1000;

/** Owners and admins manage keys from the dashboard. API keys can't reach these routes (not in the key allowlist). */
export const apiKeyRoutes = new Hono<AppEnv>();

apiKeyRoutes.use("*", async (c, next) => {
  requirePermission(c, "apiKeys.manage");
  return next();
});

apiKeyRoutes.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT k.*, a.name AS bot_name, a.avatar_url AS bot_avatar_url FROM api_keys k JOIN agents a ON a.id = k.bot_agent_id
     ORDER BY k.revoked_at IS NOT NULL, k.created_at DESC LIMIT 200`,
  ).all<ApiKeyRow & { bot_name: string; bot_avatar_url: string | null }>();
  return c.json({
    items: results.map((row) =>
      toApiKey(row, { id: row.bot_agent_id, name: row.bot_name, avatar_url: row.bot_avatar_url, kind: "bot" }),
    ),
  });
});

apiKeyRoutes.post("/", async (c) => {
  const owner = c.get("agent");
  const input = await readBody(c, createSchema);
  const active = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM api_keys WHERE revoked_at IS NULL").first<{ n: number }>();
  if ((active?.n ?? 0) >= MAX_ACTIVE_KEYS) throw conflict("Revoke an unused key first (50 active keys at most)");

  const now = Date.now();
  const token = generateApiKey();
  const keyId = newId("key");
  const botId = newId("agt");
  const scopes = [...new Set(input.scopes)];
  // The bot can never sign in: its password is random and thrown away, and login only accepts humans.
  const unusablePassword = await hashPassword(randomToken(32));
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO agents (id, email, name, avatar_url, role, kind, password_hash, created_at)
       VALUES (?, ?, ?, NULL, 'agent', 'bot', ?, ?)`,
    ).bind(botId, `${keyId}@bots.yunidesk.invalid`, input.botName ?? input.name, unusablePassword, now),
    c.env.DB.prepare(
      `INSERT INTO api_keys (id, name, token_hash, token_prefix, scopes, bot_agent_id, created_by, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      keyId,
      input.name,
      await hashApiKey(token),
      displayPrefix(token),
      JSON.stringify(scopes),
      botId,
      owner.id,
      now,
      input.expiresInDays === null ? null : now + input.expiresInDays * DAY_MS,
    ),
  ]);
  const row = await c.env.DB.prepare("SELECT * FROM api_keys WHERE id = ?").bind(keyId).first<ApiKeyRow>();
  const bot = await c.env.DB.prepare("SELECT * FROM agents WHERE id = ?").bind(botId).first<AgentRow>();
  audit(c, "api_key.created", { type: "api_key", id: keyId }, { name: input.name, scopes, expiresInDays: input.expiresInDays });
  return c.json<CreatedApiKey>({ apiKey: toApiKey(row!, bot!), token }, 201);
});

/** Revoking is immediate and final: the key stops working, its bot is disabled and its webhook endpoints stop. */
apiKeyRoutes.delete("/:id", async (c) => {
  const owner = c.get("agent");
  const row = await c.env.DB.prepare("SELECT * FROM api_keys WHERE id = ?").bind(c.req.param("id")).first<ApiKeyRow>();
  if (!row) throw notFound("API key not found");
  if (row.revoked_at === null) {
    const now = Date.now();
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE api_keys SET revoked_at = ?, revoked_by = ? WHERE id = ?").bind(now, owner.id, row.id),
      c.env.DB.prepare("UPDATE agents SET disabled_at = ? WHERE id = ?").bind(now, row.bot_agent_id),
      c.env.DB.prepare(
        "UPDATE webhook_endpoints SET status = 'disabled', disabled_reason = 'Its API key was revoked', updated_at = ? WHERE api_key_id = ? AND status = 'enabled'",
      ).bind(now, row.id),
      c.env.DB.prepare(
        `UPDATE webhook_deliveries SET status = 'failed', next_attempt_at = NULL, last_error = 'Its API key was revoked', completed_at = ?
         WHERE status = 'pending' AND endpoint_id IN (SELECT id FROM webhook_endpoints WHERE api_key_id = ?)`,
      ).bind(now, row.id),
    ]);
    audit(c, "api_key.revoked", { type: "api_key", id: row.id }, { name: row.name });
  }
  return c.json({ ok: true });
});

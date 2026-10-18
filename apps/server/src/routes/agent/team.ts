import { Hono } from "hono";
import { z } from "zod";
import type { CannedResponse, Invite } from "yunidesk";
import { publicOrigin, readBody, type AppEnv } from "../../app-env";
import type { AgentRow } from "../../db/rows";
import { toAgent } from "../../db/serialize";
import { hashPassword, randomToken, sha256, verifyPassword } from "../../lib/crypto";
import { badRequest, conflict, forbidden, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { requireOwner, startAgentSession } from "../../lib/agent-session";
import { getSettings, isOrigin, saveSettings, toAdminSettings } from "../../lib/settings";
import { inboxHub } from "../../lib/realtime";
import { matchesSignature } from "../../lib/uploads";
import { isAllowedWebhookUrl } from "../../lib/webhooks";
import { awayMessageSchema, businessHoursSchema } from "../../lib/business-hours";
import { passwordSchema } from "../agent-auth";

const INVITE_DAYS = 7;

const profileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  currentPassword: z.string().max(200).optional(),
  newPassword: passwordSchema.optional(),
});
const inviteSchema = z.object({ email: z.email().max(254), role: z.enum(["owner", "agent"]).default("agent") });
const memberPatchSchema = z.object({ role: z.enum(["owner", "agent"]).optional(), disabled: z.boolean().optional() });
const localized = z.object({ en: z.string().max(200).optional(), fr: z.string().max(200).optional() });
const settingsSchema = z.object({
  teamName: z.string().trim().min(1).max(60).optional(),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  greeting: localized.optional(),
  intro: localized.optional(),
  replyTime: z.enum(["minutes", "hour", "day"]).optional(),
  launcherPosition: z.enum(["right", "left"]).optional(),
  allowAnonymous: z.boolean().optional(),
  askEmailForAnonymous: z.boolean().optional(),
  allowedOrigins: z.array(z.string().max(200).refine(isOrigin, "Use an origin like https://example.com")).max(20).optional(),
  webhookUrl: z.url({ protocol: /^https$/ }).max(500).nullable().optional(),
  retentionDays: z.number().int().min(30).max(3650).optional(),
  businessHours: businessHoursSchema.optional(),
  awayMessage: awayMessageSchema.optional(),
});
const cannedSchema = z.object({
  shortcut: z.string().trim().min(1).max(40).regex(/^[\w-]+$/, "Letters, numbers, - and _ only"),
  title: z.string().trim().min(1).max(80),
  body: z.string().trim().min(1).max(5000),
});

export const teamRoutes = new Hono<AppEnv>();

// ---- Me ----

teamRoutes.patch("/me", async (c) => {
  const agent = c.get("agent");
  const input = await readBody(c, profileSchema);
  if (input.newPassword) {
    if (!input.currentPassword || !(await verifyPassword(input.currentPassword, agent.password_hash))) {
      throw forbidden("Current password is wrong");
    }
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE agents SET password_hash = ? WHERE id = ?").bind(await hashPassword(input.newPassword), agent.id),
      // Changing the password signs out every other session; this one gets a fresh cookie below.
      c.env.DB.prepare("DELETE FROM agent_sessions WHERE agent_id = ?").bind(agent.id),
    ]);
    // Live dashboard sockets from the old sessions go too; this tab reconnects with its new cookie.
    await inboxHub(c.env).disconnectAgent(agent.id);
    await startAgentSession(c, agent.id);
  }
  if (input.name) await c.env.DB.prepare("UPDATE agents SET name = ? WHERE id = ?").bind(input.name, agent.id).run();
  const updated = await c.env.DB.prepare("SELECT * FROM agents WHERE id = ?").bind(agent.id).first<AgentRow>();
  return c.json({ agent: toAgent(updated!) });
});

const AVATAR_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

teamRoutes.post("/me/avatar", async (c) => {
  const agent = c.get("agent");
  const form = await c.req.formData();
  const file = form.get("file");
  if (!file || typeof file === "string") throw badRequest("No file in the upload");
  if (!AVATAR_TYPES.has(file.type)) throw badRequest("Use a PNG, JPEG or WebP image");
  if (file.size > 2 * 1024 * 1024) throw badRequest("Avatars are limited to 2 MB");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesSignature(file.type, bytes.subarray(0, 16))) throw badRequest("Use a PNG, JPEG or WebP image");
  const key = `avatars/${agent.id}-${randomToken(8)}`;
  await c.env.FILES.put(key, bytes, { httpMetadata: { contentType: file.type } });
  const old = agent.avatar_url?.split("/api/avatars/")[1];
  const url = `${publicOrigin(c)}/api/avatars/${key.slice("avatars/".length)}`;
  await c.env.DB.prepare("UPDATE agents SET avatar_url = ? WHERE id = ?").bind(url, agent.id).run();
  if (old) c.executionCtx.waitUntil(c.env.FILES.delete(`avatars/${old}`));
  const updated = await c.env.DB.prepare("SELECT * FROM agents WHERE id = ?").bind(agent.id).first<AgentRow>();
  return c.json({ agent: toAgent(updated!) });
});

// ---- Team ----

teamRoutes.get("/team", async (c) => {
  const agent = c.get("agent");
  const { results } = await c.env.DB.prepare("SELECT * FROM agents WHERE kind = 'human' ORDER BY created_at").all<AgentRow>();
  let invites: Invite[] = [];
  if (agent.role === "owner") {
    const rows = await c.env.DB.prepare(
      "SELECT id, email, role, created_at, expires_at FROM agent_invites WHERE accepted_at IS NULL AND expires_at > ? ORDER BY created_at DESC",
    )
      .bind(Date.now())
      .all<{ id: string; email: string; role: "owner" | "agent"; created_at: number; expires_at: number }>();
    invites = rows.results.map((r) => ({ id: r.id, email: r.email, role: r.role, createdAt: r.created_at, expiresAt: r.expires_at }));
  }
  return c.json({
    agents: results.map((row) => ({ ...toAgent(row), disabled: row.disabled_at !== null })),
    invites,
  });
});

teamRoutes.post("/team/invites", async (c) => {
  const agent = c.get("agent");
  requireOwner(agent);
  const input = await readBody(c, inviteSchema);
  const email = input.email.toLowerCase();
  if (await c.env.DB.prepare("SELECT 1 FROM agents WHERE email = ?").bind(email).first()) {
    throw conflict("This person is already on the team");
  }
  const token = randomToken(32);
  const now = Date.now();
  const id = newId("inv");
  await c.env.DB.prepare(
    "INSERT INTO agent_invites (id, token_hash, email, role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, await sha256(token), email, input.role, agent.id, now, now + INVITE_DAYS * 24 * 3600 * 1000)
    .run();
  // The link is shown once; only its hash is stored.
  return c.json({ id, url: `${publicOrigin(c)}/invite/${token}` }, 201);
});

teamRoutes.delete("/team/invites/:id", async (c) => {
  requireOwner(c.get("agent"));
  await c.env.DB.prepare("DELETE FROM agent_invites WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

teamRoutes.patch("/team/:id", async (c) => {
  const me = c.get("agent");
  requireOwner(me);
  const input = await readBody(c, memberPatchSchema);
  const target = await c.env.DB.prepare("SELECT * FROM agents WHERE id = ? AND kind = 'human'").bind(c.req.param("id")).first<AgentRow>();
  if (!target) throw notFound("Teammate not found");
  const losesOwner = target.role === "owner" && (input.role === "agent" || input.disabled === true);
  if (losesOwner) {
    const owners = await c.env.DB.prepare(
      "SELECT COUNT(*) AS n FROM agents WHERE role = 'owner' AND disabled_at IS NULL",
    ).first<{ n: number }>();
    if ((owners?.n ?? 0) <= 1) throw badRequest("The team needs at least one owner");
  }
  const statements: D1PreparedStatement[] = [];
  if (input.role) statements.push(c.env.DB.prepare("UPDATE agents SET role = ? WHERE id = ?").bind(input.role, target.id));
  if (input.disabled !== undefined) {
    statements.push(
      c.env.DB.prepare("UPDATE agents SET disabled_at = ? WHERE id = ?").bind(input.disabled ? Date.now() : null, target.id),
    );
    if (input.disabled) {
      statements.push(c.env.DB.prepare("DELETE FROM agent_sessions WHERE agent_id = ?").bind(target.id));
      statements.push(c.env.DB.prepare("DELETE FROM agent_invites WHERE created_by = ? AND accepted_at IS NULL").bind(target.id));
      statements.push(
        c.env.DB.prepare("UPDATE conversations SET assignee_id = NULL WHERE assignee_id = ? AND status != 'resolved'").bind(
          target.id,
        ),
      );
    }
  }
  if (input.role === "agent" && target.role === "owner") {
    // Invites an owner sent shouldn't outlive their owner rights.
    statements.push(c.env.DB.prepare("DELETE FROM agent_invites WHERE created_by = ? AND accepted_at IS NULL").bind(target.id));
  }
  if (statements.length) await c.env.DB.batch(statements);
  if (input.disabled) await inboxHub(c.env).disconnectAgent(target.id);
  const updated = await c.env.DB.prepare("SELECT * FROM agents WHERE id = ?").bind(target.id).first<AgentRow>();
  return c.json({ ...toAgent(updated!), disabled: updated!.disabled_at !== null });
});

// ---- Settings ----

teamRoutes.get("/settings", async (c) => c.json(toAdminSettings(await getSettings(c.env))));

teamRoutes.put("/settings", async (c) => {
  requireOwner(c.get("agent"));
  const patch = await readBody(c, settingsSchema);
  if (patch.webhookUrl && !isAllowedWebhookUrl(patch.webhookUrl, new URL(c.req.url).hostname)) {
    throw badRequest("Use a public https URL for webhooks");
  }
  const saved = await saveSettings(c.env, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)));
  return c.json(toAdminSettings(saved));
});

/** Generates a new webhook signing secret. It is returned once. */
teamRoutes.post("/settings/webhook-secret", async (c) => {
  requireOwner(c.get("agent"));
  const secret = `whsec_${randomToken(32)}`;
  await saveSettings(c.env, { webhookSecret: secret });
  return c.json({ secret });
});

// ---- Saved replies ----

interface CannedRow {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  created_at: number;
}

const toCanned = (r: CannedRow): CannedResponse => ({
  id: r.id,
  shortcut: r.shortcut,
  title: r.title,
  body: r.body,
  createdAt: r.created_at,
});

teamRoutes.get("/canned-responses", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM canned_responses ORDER BY shortcut").all<CannedRow>();
  return c.json({ items: results.map(toCanned) });
});

teamRoutes.post("/canned-responses", async (c) => {
  const input = await readBody(c, cannedSchema);
  const id = newId("cnd");
  try {
    await c.env.DB.prepare(
      "INSERT INTO canned_responses (id, shortcut, title, body, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(id, input.shortcut, input.title, input.body, c.get("agent").id, Date.now())
      .run();
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw conflict("That shortcut is taken");
    throw error;
  }
  const row = await c.env.DB.prepare("SELECT * FROM canned_responses WHERE id = ?").bind(id).first<CannedRow>();
  return c.json(toCanned(row!), 201);
});

teamRoutes.put("/canned-responses/:id", async (c) => {
  const input = await readBody(c, cannedSchema);
  const row = await c.env.DB.prepare(
    "UPDATE canned_responses SET shortcut = ?, title = ?, body = ? WHERE id = ? RETURNING *",
  )
    .bind(input.shortcut, input.title, input.body, c.req.param("id"))
    .first<CannedRow>();
  if (!row) throw notFound("Saved reply not found");
  return c.json(toCanned(row));
});

teamRoutes.delete("/canned-responses/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM canned_responses WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

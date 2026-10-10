import { Hono } from "hono";
import { z } from "zod";
import type { WebhookEndpointWithSecret } from "yunidesk";
import { WEBHOOK_EVENT_NAMES } from "yunidesk/webhooks";
import { readBody, type AppContext, type AppEnv } from "../../app-env";
import { requireOwner } from "../../lib/agent-session";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import {
  isAllowedWebhookUrl,
  newWebhookSecret,
  openEndpointSecret,
  sealEndpointSecret,
  sealPreviousEndpointSecret,
  sendTestEvent,
  toWebhookDelivery,
  toWebhookEndpoint,
  type WebhookDeliveryRow,
  type WebhookEndpointRow,
} from "../../lib/webhooks";

const eventsSchema = z
  .array(z.enum(["*", ...WEBHOOK_EVENT_NAMES]))
  .min(1)
  .max(WEBHOOK_EVENT_NAMES.length + 1)
  .transform((events) => (events.includes("*") ? ["*"] : [...new Set(events)]));
const createSchema = z.object({
  url: z.url({ protocol: /^https$/ }).max(500),
  description: z.string().trim().max(200).nullable().default(null),
  events: eventsSchema,
});
const patchSchema = z.object({
  url: z.url({ protocol: /^https$/ }).max(500).optional(),
  description: z.string().trim().max(200).nullable().optional(),
  events: eventsSchema.optional(),
  enabled: z.boolean().optional(),
});
const rollSchema = z.object({
  /** How long the old secret keeps signing deliveries, so receivers can switch. 0 stops it now. */
  expireCurrentInHours: z.number().int().min(0).max(24).default(24),
});

const MAX_ENDPOINTS = 20;
const MAX_ENDPOINTS_PER_KEY = 5;

export const webhookEndpointRoutes = new Hono<AppEnv>();

/** Owners (dashboard) manage every endpoint; an API key manages only the endpoints it created. */
webhookEndpointRoutes.use("*", async (c, next) => {
  if (!c.get("apiKey")) requireOwner(c.get("agent"));
  return next();
});

function ownerFilter(c: AppContext): { sql: string; values: string[] } {
  const key = c.get("apiKey");
  return key ? { sql: " AND api_key_id = ?", values: [key.id] } : { sql: "", values: [] };
}

async function findEndpoint(c: AppContext, id: string): Promise<WebhookEndpointRow> {
  const filter = ownerFilter(c);
  const row = await c.env.DB.prepare(`SELECT * FROM webhook_endpoints WHERE id = ?${filter.sql}`)
    .bind(id, ...filter.values)
    .first<WebhookEndpointRow>();
  if (!row) throw notFound("Webhook endpoint not found");
  return row;
}

function assertAllowedUrl(c: AppContext, url: string): void {
  if (!isAllowedWebhookUrl(url, new URL(c.req.url).hostname)) {
    throw badRequest("Use a public https address (no IPs, localhost or workers.dev)");
  }
}

webhookEndpointRoutes.get("/", async (c) => {
  const filter = ownerFilter(c);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM webhook_endpoints WHERE 1 = 1${filter.sql} ORDER BY created_at DESC`,
  )
    .bind(...filter.values)
    .all<WebhookEndpointRow>();
  return c.json({ items: results.map(toWebhookEndpoint) });
});

webhookEndpointRoutes.post("/", async (c) => {
  const input = await readBody(c, createSchema);
  assertAllowedUrl(c, input.url);
  const key = c.get("apiKey");
  const total = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM webhook_endpoints").first<{ n: number }>();
  if ((total?.n ?? 0) >= MAX_ENDPOINTS) throw conflict(`At most ${MAX_ENDPOINTS} webhook endpoints`);
  if (key) {
    const own = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM webhook_endpoints WHERE api_key_id = ?")
      .bind(key.id)
      .first<{ n: number }>();
    if ((own?.n ?? 0) >= MAX_ENDPOINTS_PER_KEY) throw conflict(`An API key can create at most ${MAX_ENDPOINTS_PER_KEY} endpoints`);
  }
  const now = Date.now();
  const id = newId("whe");
  const secret = newWebhookSecret();
  await c.env.DB.prepare(
    `INSERT INTO webhook_endpoints (id, url, description, events, secret_ciphertext, api_key_id, created_by, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'enabled', ?, ?)`,
  )
    .bind(
      id,
      input.url,
      input.description,
      JSON.stringify(input.events),
      await sealEndpointSecret(c.env, id, secret),
      key?.id ?? null,
      c.get("agent").id,
      now,
      now,
    )
    .run();
  const row = await findEndpoint(c, id);
  return c.json<WebhookEndpointWithSecret>({ endpoint: toWebhookEndpoint(row), secret }, 201);
});

webhookEndpointRoutes.get("/:id", async (c) => c.json(toWebhookEndpoint(await findEndpoint(c, c.req.param("id")))));

webhookEndpointRoutes.patch("/:id", async (c) => {
  const row = await findEndpoint(c, c.req.param("id"));
  const input = await readBody(c, patchSchema);
  if (input.url) assertAllowedUrl(c, input.url);
  const sets: string[] = ["updated_at = ?"];
  const values: unknown[] = [Date.now()];
  if (input.url !== undefined) sets.push("url = ?"), values.push(input.url);
  if (input.description !== undefined) sets.push("description = ?"), values.push(input.description);
  if (input.events !== undefined) sets.push("events = ?"), values.push(JSON.stringify(input.events));
  if (input.enabled === true) sets.push("status = 'enabled', disabled_reason = NULL, failing_since = NULL");
  if (input.enabled === false) sets.push("status = 'disabled', disabled_reason = 'Disabled by hand'");
  await c.env.DB.prepare(`UPDATE webhook_endpoints SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values, row.id)
    .run();
  return c.json(toWebhookEndpoint(await findEndpoint(c, row.id)));
});

webhookEndpointRoutes.delete("/:id", async (c) => {
  const row = await findEndpoint(c, c.req.param("id"));
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM webhook_deliveries WHERE endpoint_id = ?").bind(row.id),
    c.env.DB.prepare("DELETE FROM webhook_endpoints WHERE id = ?").bind(row.id),
  ]);
  return c.json({ ok: true });
});

/** New secret now; the current one keeps signing (as a second v1) until it expires. */
webhookEndpointRoutes.post("/:id/roll-secret", async (c) => {
  const row = await findEndpoint(c, c.req.param("id"));
  const { expireCurrentInHours } = await readBody(c, rollSchema);
  const now = Date.now();
  const secret = newWebhookSecret();
  const current = await openEndpointSecret(c.env, row);
  await c.env.DB.prepare(
    `UPDATE webhook_endpoints SET secret_ciphertext = ?, previous_secret_ciphertext = ?, previous_secret_expires_at = ?, updated_at = ?
     WHERE id = ?`,
  )
    .bind(
      await sealEndpointSecret(c.env, row.id, secret),
      expireCurrentInHours > 0 ? await sealPreviousEndpointSecret(c.env, row.id, current) : null,
      expireCurrentInHours > 0 ? now + expireCurrentInHours * 3600_000 : null,
      now,
      row.id,
    )
    .run();
  return c.json<WebhookEndpointWithSecret>({ endpoint: toWebhookEndpoint(await findEndpoint(c, row.id)), secret });
});

webhookEndpointRoutes.post("/:id/test", async (c) => {
  const row = await findEndpoint(c, c.req.param("id"));
  if (row.status !== "enabled") throw badRequest("Enable the endpoint first");
  const delivery = await sendTestEvent(c.env, row);
  return c.json(delivery ? toWebhookDelivery(delivery) : null);
});

webhookEndpointRoutes.get("/:id/deliveries", async (c) => {
  const row = await findEndpoint(c, c.req.param("id"));
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM webhook_deliveries WHERE endpoint_id = ? ORDER BY created_at DESC LIMIT 50",
  )
    .bind(row.id)
    .all<WebhookDeliveryRow>();
  return c.json({ items: results.map(toWebhookDelivery) });
});

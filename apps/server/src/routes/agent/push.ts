import { Hono } from "hono";
import { z } from "zod";
import type { PushSettings } from "yunidesk";
import { limit, publicOrigin, readBody, type AppEnv, type AppContext } from "../../app-env";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { deliver, parsePushPreferences, testPayload, type PushSubscriptionRow } from "../../lib/push/notify";
import { getVapidKeys } from "../../lib/push/vapid";
import { isAllowedPushEndpoint, isValidSubscriptionKeys } from "../../lib/web-push";

/** Devices per teammate; subscribing one more forgets the oldest. */
const MAX_DEVICES = 10;

const endpointSchema = z.string().max(1024);
const subscribeSchema = z.object({
  endpoint: endpointSchema,
  keys: z.object({ p256dh: z.string().max(200), auth: z.string().max(100) }),
  replaces: endpointSchema.optional(),
});
const endpointBody = z.object({ endpoint: endpointSchema });
const preferencesSchema = z
  .object({ newConversation: z.boolean(), assignedMessage: z.boolean(), assigned: z.boolean(), handoff: z.boolean() })
  .partial();

/** Push notifications for the signed-in teammate's own devices. Session only: API keys never get here. */
export const pushRoutes = new Hono<AppEnv>();

pushRoutes.use("*", async (c, next) => {
  if (c.get("apiKey")) throw forbidden("API keys can't use this endpoint");
  await next();
});

function ownHost(c: AppContext): string {
  return new URL(publicOrigin(c)).hostname;
}

async function pushSettings(c: AppContext): Promise<PushSettings> {
  const agent = c.get("agent");
  const [row, count] = await Promise.all([
    c.env.DB.prepare("SELECT push_preferences FROM agents WHERE id = ?").bind(agent.id).first<{ push_preferences: string }>(),
    c.env.DB.prepare("SELECT COUNT(*) AS n FROM push_subscriptions WHERE agent_id = ?").bind(agent.id).first<{ n: number }>(),
  ]);
  return { preferences: parsePushPreferences(row?.push_preferences), devices: count?.n ?? 0 };
}

pushRoutes.get("/public-key", async (c) => {
  const { publicKey } = await getVapidKeys(c.env);
  return c.json({ publicKey });
});

pushRoutes.get("/preferences", async (c) => c.json(await pushSettings(c)));

pushRoutes.put("/preferences", async (c) => {
  const agent = c.get("agent");
  const patch = await readBody(c, preferencesSchema);
  const row = await c.env.DB.prepare("SELECT push_preferences FROM agents WHERE id = ?").bind(agent.id).first<{ push_preferences: string }>();
  const next = { ...parsePushPreferences(row?.push_preferences), ...patch };
  await c.env.DB.prepare("UPDATE agents SET push_preferences = ? WHERE id = ?").bind(JSON.stringify(next), agent.id).run();
  return c.json(await pushSettings(c));
});

/** Turns push on for this device (idempotent: the same endpoint is updated, and moves to whoever signed in). */
pushRoutes.post("/subscriptions", async (c) => {
  const agent = c.get("agent");
  await limit(c.env.WRITE_LIMITER, `agent:${agent.id}`);
  const input = await readBody(c, subscribeSchema);
  if (!isAllowedPushEndpoint(input.endpoint, ownHost(c))) throw badRequest("Unsupported push endpoint", "invalid_endpoint");
  if (!isValidSubscriptionKeys(input.keys)) throw badRequest("Invalid subscription keys", "invalid_keys");
  const now = Date.now();
  const statements = [
    c.env.DB.prepare(
      `INSERT INTO push_subscriptions (id, agent_id, endpoint, p256dh, auth, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET agent_id = excluded.agent_id, p256dh = excluded.p256dh, auth = excluded.auth,
         user_agent = excluded.user_agent, failure_count = 0`,
    ).bind(`psh_${crypto.randomUUID()}`, agent.id, input.endpoint, input.keys.p256dh, input.keys.auth, (c.req.header("user-agent") ?? "").slice(0, 200), now),
    c.env.DB.prepare(
      `DELETE FROM push_subscriptions WHERE agent_id = ? AND id NOT IN
         (SELECT id FROM push_subscriptions WHERE agent_id = ? ORDER BY created_at DESC LIMIT ?)`,
    ).bind(agent.id, agent.id, MAX_DEVICES),
  ];
  if (input.replaces && input.replaces !== input.endpoint) {
    statements.push(c.env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND agent_id = ?").bind(input.replaces, agent.id));
  }
  await c.env.DB.batch(statements);
  return c.json(await pushSettings(c), 201);
});

/** Turns push off for this device. */
pushRoutes.delete("/subscriptions", async (c) => {
  const agent = c.get("agent");
  const { endpoint } = await readBody(c, endpointBody);
  await c.env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND agent_id = ?").bind(endpoint, agent.id).run();
  return c.json(await pushSettings(c));
});

/** Sends a test notification to this device, even if the dashboard is on screen. */
pushRoutes.post("/test", async (c) => {
  const agent = c.get("agent");
  await limit(c.env.WRITE_LIMITER, `agent:${agent.id}`);
  const { endpoint } = await readBody(c, endpointBody);
  const subscription = await c.env.DB.prepare("SELECT * FROM push_subscriptions WHERE endpoint = ? AND agent_id = ?")
    .bind(endpoint, agent.id)
    .first<PushSubscriptionRow>();
  if (!subscription) throw notFound("This device is not subscribed");
  const result = await deliver(c.env, await getVapidKeys(c.env), publicOrigin(c), subscription, testPayload(), "normal");
  return c.json(result);
});

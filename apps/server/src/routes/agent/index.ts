import { Hono } from "hono";
import { WEBHOOK_EVENT_CATALOG } from "yunidesk/webhooks";
import { limit, type AppEnv } from "../../app-env";
import type { AgentRow } from "../../db/rows";
import { toAgent, toPublicAgent } from "../../db/serialize";
import { assertTrustedOrigin, requireAgent } from "../../lib/agent-session";
import { authenticateApiKey, toApiKey, type ApiKeyRow } from "../../lib/api-keys";
import { forbidden, unauthorized } from "../../lib/errors";
import { inboxHub } from "../../lib/realtime";
import { can } from "../../lib/permissions";
import { getSettings, toAdminSettings } from "../../lib/settings";
import { apiKeyRoutes } from "./api-keys";
import { assignmentRoutes, availabilityRoutes } from "./assignment";
import { teamsRoutes } from "./teams";
import { toTeammate } from "../../db/teams";
import { assistantRoutes } from "./assistant";
import { auditLogRoutes } from "./audit-log";
import { contactAdminRoutes } from "./contacts";
import { conversationFieldRoutes } from "./conversation-fields";
import { emailRoutes } from "./email";
import { attachmentRoutes, inboxRoutes } from "./inbox";
import { reportRoutes } from "./reports";
import { conversationTagRoutes, tagRoutes } from "./tags";
import { pushRoutes } from "./push";
import { ssoRoutes } from "./sso";
import { teamRoutes } from "./team";
import { webhookEndpointRoutes } from "./webhook-endpoints";

const BASE_PATH = "/api/agent";

export const agentRoutes = new Hono<AppEnv>();

/**
 * Two ways in:
 * - `Authorization: Bearer ydk_…` (integrations, server to server): the key acts as its bot
 *   teammate and may only call the routes its scopes allow. No cookies, so no CSRF check.
 * - The dashboard's session cookie, with an Origin check against CSRF.
 */
agentRoutes.use("*", async (c, next) => {
  if (c.req.header("authorization") !== undefined) {
    const { auth, agent } = await authenticateApiKey(c, c.req.path.slice(BASE_PATH.length));
    await limit(c.env.API_LIMITER, `key:${auth.id}`);
    c.set("agent", agent);
    c.set("apiKey", auth);
    return next();
  }
  assertTrustedOrigin(c);
  c.set("agent", await requireAgent(c));
  c.set("apiKey", null);
  return next();
});

/** The calling key, its bot and the workspace name; integrations use it to check a key works. */
agentRoutes.get("/key", async (c) => {
  const key = c.get("apiKey");
  if (!key) throw unauthorized("Call this with an API key");
  const row = await c.env.DB.prepare("SELECT * FROM api_keys WHERE id = ?").bind(key.id).first<ApiKeyRow>();
  const settings = await getSettings(c.env);
  return c.json({ apiKey: toApiKey(row!, c.get("agent")), workspace: { name: settings.teamName } });
});

/** Every event this server sends (names, descriptions, fields), for integrations' trigger lists. */
agentRoutes.get("/events", (c) => {
  c.header("cache-control", "private, max-age=300");
  return c.json({ items: WEBHOOK_EVENT_CATALOG });
});

/** People who can be assigned conversations, with whether they are available or away. */
agentRoutes.get("/teammates", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM agents WHERE disabled_at IS NULL AND kind = 'human' ORDER BY name",
  ).all<AgentRow>();
  return c.json({ items: results.map(toTeammate) });
});

agentRoutes.get("/bootstrap", async (c) => {
  const agent = c.get("agent");
  const { results } = await c.env.DB.prepare("SELECT * FROM agents WHERE disabled_at IS NULL AND kind = 'human' ORDER BY name").all<AgentRow>();
  return c.json({
    agent: toAgent(agent),
    teammates: results.map(toTeammate),
    settings: toAdminSettings(await getSettings(c.env)),
  });
});

agentRoutes.get("/ws", async (c) => {
  if (c.req.header("upgrade") !== "websocket") return c.text("Expected websocket", 426);
  // Browsers always send Origin on websocket upgrades; require ours (cross-site websocket hijacking).
  if (!c.req.header("origin")) throw forbidden("Missing origin");
  const agent = c.get("agent");
  const headers = new Headers(c.req.raw.headers);
  headers.set("x-agent", encodeURIComponent(JSON.stringify(toPublicAgent(agent))));
  headers.set("x-agent-session", c.get("sessionHash"));
  // Viewers watch: their typing signals are dropped.
  headers.set("x-agent-can-type", can(agent.role, "inbox.reply") ? "1" : "0");
  return inboxHub(c.env).fetch(new Request(c.req.raw.url, { headers }));
});

agentRoutes.route("/conversations", conversationTagRoutes);
agentRoutes.route("/conversations", inboxRoutes);
agentRoutes.route("/tags", tagRoutes);
agentRoutes.route("/conversation-fields", conversationFieldRoutes);
agentRoutes.route("/attachments", attachmentRoutes);
agentRoutes.route("/contacts", contactAdminRoutes);
agentRoutes.route("/api-keys", apiKeyRoutes);
agentRoutes.route("/assistant", assistantRoutes);
agentRoutes.route("/webhook-endpoints", webhookEndpointRoutes);
agentRoutes.route("/push", pushRoutes);
agentRoutes.route("/email", emailRoutes);
agentRoutes.route("/audit-log", auditLogRoutes);
agentRoutes.route("/sso", ssoRoutes);
agentRoutes.route("/reports", reportRoutes);
agentRoutes.route("/teams", teamsRoutes);
agentRoutes.route("/assignment", assignmentRoutes);
agentRoutes.route("/me/availability", availabilityRoutes);
agentRoutes.route("/", teamRoutes);

import { Hono } from "hono";
import type { AppEnv } from "../../app-env";
import type { AgentRow } from "../../db/rows";
import { toAgent, toPublicAgent } from "../../db/serialize";
import { assertTrustedOrigin, requireAgent } from "../../lib/agent-session";
import { forbidden } from "../../lib/errors";
import { inboxHub } from "../../lib/realtime";
import { getSettings, toAdminSettings } from "../../lib/settings";
import { contactAdminRoutes } from "./contacts";
import { attachmentRoutes, inboxRoutes } from "./inbox";
import { teamRoutes } from "./team";

export const agentRoutes = new Hono<AppEnv>();

agentRoutes.use("*", async (c, next) => {
  assertTrustedOrigin(c);
  c.set("agent", await requireAgent(c));
  return next();
});

agentRoutes.get("/bootstrap", async (c) => {
  const agent = c.get("agent");
  const { results } = await c.env.DB.prepare("SELECT * FROM agents WHERE disabled_at IS NULL ORDER BY name").all<AgentRow>();
  return c.json({
    agent: toAgent(agent),
    teammates: results.map(toPublicAgent),
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
  return inboxHub(c.env).fetch(new Request(c.req.raw.url, { headers }));
});

agentRoutes.route("/conversations", inboxRoutes);
agentRoutes.route("/attachments", attachmentRoutes);
agentRoutes.route("/contacts", contactAdminRoutes);
agentRoutes.route("/", teamRoutes);

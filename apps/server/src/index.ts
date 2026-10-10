import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv } from "./app-env";
import { wakeSnoozed } from "./db/conversations";
import type { Env } from "./env";
import { runRetention } from "./jobs/retention";
import { retryDueDeliveries } from "./lib/webhooks";
import { ApiError } from "./lib/errors";
import { embedOrigins } from "./lib/settings";
import { agentAuthRoutes } from "./routes/agent-auth";
import { agentRoutes } from "./routes/agent";
import { contactRoutes } from "./routes/contact";
import { fileRoutes } from "./routes/files";
import { openApiDocument } from "./openapi";

export { ContactChannel } from "./durable/contact-channel";
export { InboxHub } from "./durable/inbox-hub";

const app = new Hono<AppEnv>();

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const UPLOAD_PATH = /\/(attachments|me\/avatar)$/;

/** Production refuses to run on missing, short or placeholder secrets (anyone could forge sessions). */
function secretsProblem(env: Env): string | null {
  for (const name of ["SESSION_SECRET", "IDENTITY_SECRET"] as const) {
    const value = env[name] ?? "";
    if (value.length < 32 || value.startsWith("change-me")) return name;
  }
  return null;
}

app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  // ENVIRONMENT=development only exists in the local .dev.vars (wrangler dev may present the route's host).
  const local = c.env.ENVIRONMENT === "development" || LOCAL_HOSTS.has(url.hostname);
  if (!local) {
    if (url.protocol === "http:") {
      url.protocol = "https:";
      return c.redirect(url.toString(), 301);
    }
    const problem = secretsProblem(c.env);
    if (problem) {
      console.error(`refusing to serve: ${problem} is missing, too short or a placeholder`);
      return c.text("Server misconfigured", 503);
    }
  }
  await next();
  if (!local) c.header("strict-transport-security", "max-age=31536000; includeSubDomains");
});

app.use("/api/*", (c, next) =>
  bodyLimit({
    maxSize: UPLOAD_PATH.test(c.req.path) ? 11 * 1024 * 1024 : 64 * 1024,
    onError: (ctx) => ctx.json({ error: { code: "too_large", message: "Request is too large" } }, 413),
  })(c, next),
);

app.onError((error, c) => {
  if (error instanceof ApiError) {
    return c.json({ error: { code: error.code, message: error.message } }, error.status);
  }
  console.error("unhandled", error);
  return c.json({ error: { code: "internal", message: "Something went wrong" } }, 500);
});

app.use("/api/*", async (c, next) => {
  await next();
  c.header("cache-control", c.res.headers.get("cache-control") ?? "no-store");
  c.header("x-content-type-options", "nosniff");
});

app.get("/api/health", (c) => c.json({ ok: true }));
app.get("/api/openapi.json", (c) => {
  c.header("cache-control", "public, max-age=3600");
  c.header("access-control-allow-origin", "*");
  return c.json(openApiDocument);
});
app.route("/api/v1", contactRoutes);
app.route("/api/agent/auth", agentAuthRoutes);
app.route("/api/agent", agentRoutes);
app.route("/api", fileRoutes);
app.all("/api/*", (c) => c.json({ error: { code: "not_found", message: "Not found" } }, 404));

/** The widget page runs inside an iframe on your site; only the allowed origins may frame it. */
app.get("/widget/", async (c) => {
  const asset = await c.env.ASSETS.fetch(new Request(new URL("/widget/", c.req.url)));
  const origins = await embedOrigins(c.env);
  const headers = new Headers(asset.headers);
  headers.set(
    "content-security-policy",
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "connect-src 'self'",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
      `frame-ancestors ${origins.length ? origins.join(" ") : "'self'"}`,
    ].join("; "),
  );
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "no-referrer");
  headers.set("cache-control", "no-cache");
  return new Response(asset.body, { status: asset.status, headers });
});

const DASHBOARD_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "font-src 'self' data:",
  "frame-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** Everything else is the dashboard or a static file. */
app.all("*", async (c) => {
  const response = await c.env.ASSETS.fetch(c.req.raw);
  const headers = new Headers(response.headers);
  headers.set("x-content-type-options", "nosniff");
  headers.set("referrer-policy", "strict-origin-when-cross-origin");
  if ((headers.get("content-type") ?? "").includes("text/html")) {
    headers.set("content-security-policy", DASHBOARD_CSP);
    headers.set("x-frame-options", "DENY");
    headers.set("cache-control", "no-cache");
  }
  if (new URL(c.req.url).pathname === "/widget.js") headers.set("cache-control", "public, max-age=300");
  return new Response(response.body, { status: response.status, headers });
});

export default {
  fetch: app.fetch,
  async scheduled(controller, env, ctx) {
    const origin = env.PUBLIC_URL ?? "";
    if (controller.cron === "* * * * *") {
      const retried = await retryDueDeliveries(env);
      if (retried) console.log(`retried ${retried} webhook deliveries`);
    } else if (controller.cron === "*/5 * * * *") {
      const woken = await wakeSnoozed(env, ctx, origin);
      if (woken) console.log(`woke ${woken} snoozed conversations`);
    } else {
      console.log("retention", await runRetention(env));
    }
  },
} satisfies ExportedHandler<Env>;

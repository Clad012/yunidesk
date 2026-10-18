import { Hono } from "hono";
import { z } from "zod";
import type { SsoSettings } from "yunidesk";
import { publicOrigin, readBody, type AppEnv } from "../../app-env";
import { audit, changedKeys } from "../../lib/audit";
import { badRequest } from "../../lib/errors";
import { inboxHub } from "../../lib/realtime";
import { requirePermission } from "../../lib/permissions";
import { discover, isAllowedProviderUrl, OidcError } from "../../lib/sso/oidc";
import { getSso, saveSso, sealClientSecret, toSsoSettings, type StoredSso } from "../../lib/sso/settings";

const DOMAIN = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  issuer: z.string().trim().max(300).optional(),
  clientId: z.string().trim().max(300).optional(),
  clientSecret: z.string().trim().min(1).max(500).nullable().optional(),
  allowedDomains: z
    .array(z.string().trim().toLowerCase().regex(DOMAIN, "Use a domain like example.com"))
    .max(20)
    .transform((domains) => [...new Set(domains)])
    .optional(),
  requireSso: z.boolean().optional(),
  createRole: z.enum(["agent", "viewer"]).nullable().optional(),
});
const testSchema = z.object({ issuer: z.string().trim().min(1).max(300).optional() });

/** Single sign-on settings: owners only, session only (not reachable with an API key). */
export const ssoRoutes = new Hono<AppEnv>();

ssoRoutes.use("*", async (c, next) => {
  requirePermission(c, "sso.manage");
  return next();
});

ssoRoutes.get("/", async (c) => c.json<SsoSettings>(toSsoSettings(await getSso(c.env), publicOrigin(c))));

ssoRoutes.put("/", async (c) => {
  const patch = await readBody(c, patchSchema);
  const before = await getSso(c.env);
  const { clientSecret, ...plain } = patch;
  const next: StoredSso = { ...before, ...Object.fromEntries(Object.entries(plain).filter(([, v]) => v !== undefined)) };
  if (clientSecret !== undefined) next.clientSecretSealed = clientSecret === null ? null : await sealClientSecret(c.env, clientSecret);

  if (next.issuer && !isAllowedProviderUrl(c.env, next.issuer)) throw badRequest("The issuer must be a public https URL");
  if (next.enabled) {
    if (!next.issuer || !next.clientId || !next.clientSecretSealed) throw badRequest("Add the issuer, client ID and client secret first");
    if (next.allowedDomains.length === 0) throw badRequest("Add at least one allowed email domain");
    if (next.issuer !== before.issuer || !before.enabled) {
      try {
        await discover(c.env, next.issuer, true);
      } catch (error) {
        throw badRequest(error instanceof OidcError ? error.message : "The provider could not be reached");
      }
    }
  }
  await saveSso(c.env, next);

  // Turning on "Require SSO" signs out everyone who isn't an owner; they come back through SSO.
  if (next.enabled && next.requireSso && !(before.enabled && before.requireSso)) {
    const { results } = await c.env.DB.prepare(
      "SELECT DISTINCT s.agent_id FROM agent_sessions s JOIN agents a ON a.id = s.agent_id WHERE a.role != 'owner'",
    ).all<{ agent_id: string }>();
    await c.env.DB.prepare("DELETE FROM agent_sessions WHERE agent_id IN (SELECT id FROM agents WHERE role != 'owner')").run();
    c.executionCtx.waitUntil(Promise.all(results.map((r) => inboxHub(c.env).disconnectAgent(r.agent_id))));
  }

  const keys = [...changedKeys(before, plain), ...(clientSecret !== undefined ? ["clientSecret"] : [])];
  if (keys.length) audit(c, "sso.updated", { type: "sso", id: "workspace" }, { keys });
  return c.json<SsoSettings>(toSsoSettings(next, publicOrigin(c)));
});

/** Fetches the provider's discovery document, to check the issuer before saving. */
ssoRoutes.post("/test", async (c) => {
  const { issuer } = await readBody(c, testSchema);
  const target = issuer ?? (await getSso(c.env)).issuer;
  if (!target) throw badRequest("Add the issuer URL first");
  try {
    const doc = await discover(c.env, target, true);
    return c.json({
      ok: true,
      issuer: doc.issuer,
      authorizationEndpoint: doc.authorization_endpoint,
      tokenEndpoint: doc.token_endpoint,
      jwksUri: doc.jwks_uri,
    });
  } catch (error) {
    throw badRequest(error instanceof OidcError ? error.message : "The provider could not be reached", "sso_test_failed");
  }
});

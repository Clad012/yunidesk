import { Hono } from "hono";
import { clientIp, publicOrigin, type AppContext, type AppEnv } from "../app-env";
import type { AgentRow } from "../db/rows";
import { audit } from "../lib/audit";
import { hashPassword, randomToken } from "../lib/crypto";
import { newId } from "../lib/ids";
import { startAgentSession } from "../lib/agent-session";
import { hasVerifiedEmail, IdTokenError, isAllowedDomain, verifyIdToken, type IdTokenClaims } from "../lib/sso/id-token";
import { discover, exchangeCode, OidcError, signingKeys, type Discovery } from "../lib/sso/oidc";
import { callbackUrl, getSso, isSsoReady, openClientSecret, type StoredSso } from "../lib/sso/settings";
import { codeChallenge, decodeSsoState, newSsoState, setSsoCookie, takeSsoCookie } from "../lib/sso/state-cookie";
import { findInviteByEmail } from "./agent-auth";

/**
 * Sign-in with OpenID Connect (authorization code + PKCE). Top-level browser navigations, so every
 * outcome is a redirect: to the dashboard, or to /login?sso_error=<code> after an audited failure.
 */
export const agentSsoRoutes = new Hono<AppEnv>();

type Failure =
  | "not_configured"
  | "rate_limited"
  | "provider"
  | "state"
  | "exchange"
  | "token"
  | "email_unverified"
  | "domain"
  | "disabled"
  | "not_invited";

class SsoFailure extends Error {
  constructor(
    readonly code: Failure,
    readonly detail?: string,
    readonly email?: string,
  ) {
    super(code);
  }
}

function fail(c: AppContext, failure: SsoFailure): Response {
  // Throttled attempts aren't written: past the limit they'd only fill the log.
  if (failure.code !== "rate_limited") audit(
    c,
    "auth.sso_failed",
    null,
    { reason: failure.code, ...(failure.detail ? { detail: failure.detail.slice(0, 200) } : {}) },
    { type: "agent", id: null, name: failure.email ?? null },
  );
  return c.redirect(`/login?sso_error=${failure.code}`, 302);
}

async function allowed(c: AppContext): Promise<boolean> {
  const { success } = await c.env.AUTH_LIMITER.limit({ key: `sso:${clientIp(c)}` });
  return success;
}

async function readyConfig(c: AppContext): Promise<{ sso: StoredSso; discovery: Discovery }> {
  const sso = await getSso(c.env);
  if (!isSsoReady(sso)) throw new SsoFailure("not_configured");
  try {
    return { sso, discovery: await discover(c.env, sso.issuer) };
  } catch (error) {
    throw new SsoFailure("provider", error instanceof Error ? error.message : undefined);
  }
}

// Only the callback is throttled: it does the work, and a whole office may share one IP.
agentSsoRoutes.get("/start", async (c) => {
  try {
    const { sso, discovery } = await readyConfig(c);
    const value = newSsoState();
    await setSsoCookie(c, value);
    const url = new URL(discovery.authorization_endpoint);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", sso.clientId);
    url.searchParams.set("redirect_uri", callbackUrl(publicOrigin(c)));
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", value.state);
    url.searchParams.set("nonce", value.nonce);
    url.searchParams.set("code_challenge", await codeChallenge(value.verifier));
    url.searchParams.set("code_challenge_method", "S256");
    return c.redirect(url.toString(), 302);
  } catch (error) {
    if (error instanceof SsoFailure) return fail(c, error);
    throw error;
  }
});

agentSsoRoutes.get("/callback", async (c) => {
  try {
    if (!(await allowed(c))) throw new SsoFailure("rate_limited");
    const raw = takeSsoCookie(c);
    const { sso, discovery } = await readyConfig(c);
    const providerError = c.req.query("error");
    if (providerError) throw new SsoFailure("provider", providerError);
    const state = await decodeSsoState(c.env.SESSION_SECRET, raw, c.req.query("state") ?? "");
    if (!state) throw new SsoFailure("state");
    const code = c.req.query("code");
    if (!code) throw new SsoFailure("exchange", "no code");

    let idToken: string;
    try {
      idToken = await exchangeCode(discovery, {
        code,
        redirectUri: callbackUrl(publicOrigin(c)),
        verifier: state.verifier,
        clientId: sso.clientId,
        clientSecret: await openClientSecret(c.env, sso.clientSecretSealed!),
      });
    } catch (error) {
      throw new SsoFailure("exchange", error instanceof OidcError ? error.message : undefined);
    }
    const claims = await verify(idToken, discovery, sso, state.nonce);
    const email = (claims.email ?? "").toLowerCase();
    if (!hasVerifiedEmail(claims)) throw new SsoFailure("email_unverified", undefined, email || undefined);
    if (!isAllowedDomain(email, sso.allowedDomains)) throw new SsoFailure("domain", undefined, email);

    const agent = await findOrCreateAgent(c, sso, email, claims);
    await startAgentSession(c, agent.id);
    audit(c, "auth.sso_sign_in", { type: "agent", id: agent.id }, { issuer: sso.issuer }, { type: "agent", id: agent.id, name: agent.name });
    return c.redirect("/", 302);
  } catch (error) {
    if (error instanceof SsoFailure) return fail(c, error);
    throw error;
  }
});

async function verify(idToken: string, discovery: Discovery, sso: StoredSso, nonce: string): Promise<IdTokenClaims> {
  const options = { issuer: discovery.issuer, clientId: sso.clientId, nonce, now: Date.now() };
  try {
    return await verifyIdToken(idToken, { ...options, keys: await signingKeys(discovery) });
  } catch (error) {
    // The provider may have rotated its keys since we cached them.
    if (error instanceof IdTokenError && error.reason === "key") {
      try {
        return await verifyIdToken(idToken, { ...options, keys: await signingKeys(discovery, true) });
      } catch (retry) {
        throw new SsoFailure("token", retry instanceof IdTokenError ? retry.reason : undefined);
      }
    }
    throw new SsoFailure("token", error instanceof IdTokenError ? error.reason : error instanceof OidcError ? error.message : undefined);
  }
}

/** An existing teammate with this email, else a pending invite, else a new teammate if allowed. */
async function findOrCreateAgent(c: AppContext, sso: StoredSso, email: string, claims: IdTokenClaims): Promise<AgentRow> {
  const existing = await c.env.DB.prepare("SELECT * FROM agents WHERE email = ?").bind(email).first<AgentRow>();
  if (existing) {
    if (existing.disabled_at !== null || existing.kind !== "human") throw new SsoFailure("disabled", undefined, email);
    return existing;
  }
  const invite = await findInviteByEmail(c.env.DB, email);
  const role = invite?.role ?? sso.createRole;
  if (!role) throw new SsoFailure("not_invited", undefined, email);

  const id = newId("agt");
  const now = Date.now();
  const name = (typeof claims.name === "string" ? claims.name.trim().slice(0, 80) : "") || email.split("@")[0]!;
  // A random password nobody knows: this account signs in through the provider.
  const unusablePassword = await hashPassword(randomToken(32));
  const statements = [
    c.env.DB.prepare(
      "INSERT INTO agents (id, email, name, role, password_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(id, email, name, role, unusablePassword, now),
  ];
  if (invite) statements.push(c.env.DB.prepare("UPDATE agent_invites SET accepted_at = ? WHERE id = ?").bind(now, invite.id));
  await c.env.DB.batch(statements);
  const actor = { type: "agent" as const, id, name };
  if (invite) audit(c, "auth.invite_accepted", { type: "invite", id: invite.id }, { role, via: "sso" }, actor);
  else audit(c, "team.member_created", { type: "agent", id }, { role, via: "sso" }, actor);
  const created = await c.env.DB.prepare("SELECT * FROM agents WHERE id = ?").bind(id).first<AgentRow>();
  return created!;
}

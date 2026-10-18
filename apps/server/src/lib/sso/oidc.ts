import type { Env } from "../../env";
import { isAllowedWebhookUrl } from "../webhooks";
import type { Jwk } from "./id-token";

export interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  token_endpoint_auth_methods_supported?: string[];
  code_challenge_methods_supported?: string[];
}

export class OidcError extends Error {}

const CACHE_MS = 3600_000;
/** Unknown kid: refetch the keys (rotation), but not more than once a minute. */
const JWKS_REFRESH_MS = 60_000;
const TIMEOUT_MS = 10_000;

const discoveries = new Map<string, { value: Discovery; at: number }>();
const keySets = new Map<string, { keys: Jwk[]; at: number }>();

/**
 * Where the provider may live: a public https address. Local development also allows
 * http://localhost, to test against a provider running on the same machine.
 */
export function isAllowedProviderUrl(env: Env, value: string): boolean {
  if (env.ENVIRONMENT === "development") {
    try {
      const url = new URL(value);
      if (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)) return true;
    } catch {
      return false;
    }
  }
  return isAllowedWebhookUrl(value, "");
}

/** Same issuer, ignoring one trailing slash (providers differ on it). */
function sameIssuer(a: string, b: string): boolean {
  return a.replace(/\/$/, "") === b.replace(/\/$/, "");
}

async function getJson(url: string, init?: RequestInit): Promise<{ status: number; body: unknown }> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new OidcError(`Could not reach ${new URL(url).host}`);
  }
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) as unknown };
  } catch {
    throw new OidcError(`${new URL(url).host} answered HTTP ${response.status} without JSON`);
  }
}

/** The provider's `.well-known/openid-configuration`, checked and cached for an hour. */
export async function discover(env: Env, issuer: string, fresh = false): Promise<Discovery> {
  const cached = discoveries.get(issuer);
  if (!fresh && cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  if (!isAllowedProviderUrl(env, issuer)) throw new OidcError("The issuer must be a public https URL");
  const url = `${issuer.replace(/\/$/, "")}/.well-known/openid-configuration`;
  const { status, body } = await getJson(url, { headers: { accept: "application/json" } });
  if (status !== 200) throw new OidcError(`The discovery document answered HTTP ${status}`);
  const doc = body as Partial<Discovery>;
  if (typeof doc.issuer !== "string" || !sameIssuer(doc.issuer, issuer)) {
    throw new OidcError(`The provider calls itself ${String(doc.issuer)}, not ${issuer}`);
  }
  for (const field of ["authorization_endpoint", "token_endpoint", "jwks_uri"] as const) {
    const value = doc[field];
    if (typeof value !== "string" || !isAllowedProviderUrl(env, value)) {
      throw new OidcError(`The discovery document has no usable ${field}`);
    }
  }
  if (doc.code_challenge_methods_supported && !doc.code_challenge_methods_supported.includes("S256")) {
    throw new OidcError("The provider doesn't support PKCE with S256");
  }
  const value = doc as Discovery;
  discoveries.set(issuer, { value, at: Date.now() });
  return value;
}

/** The provider's signing keys; `refresh` refetches them (a token signed with a key we don't know yet). */
export async function signingKeys(discovery: Discovery, refresh = false): Promise<Jwk[]> {
  const cached = keySets.get(discovery.jwks_uri);
  const age = cached ? Date.now() - cached.at : Infinity;
  if (cached && age < CACHE_MS && !(refresh && age > JWKS_REFRESH_MS)) return cached.keys;
  const { status, body } = await getJson(discovery.jwks_uri, { headers: { accept: "application/json" } });
  const keys = (body as { keys?: unknown }).keys;
  if (status !== 200 || !Array.isArray(keys)) throw new OidcError("The provider's signing keys could not be read");
  const valid = keys.filter((k): k is Jwk => !!k && typeof k === "object" && typeof (k as Jwk).kty === "string");
  keySets.set(discovery.jwks_uri, { keys: valid, at: Date.now() });
  return valid;
}

/** RFC 6749 2.3.1: client id and secret are form-encoded before going into Basic auth. */
function basicAuth(clientId: string, secret: string): string {
  const encode = (v: string) => encodeURIComponent(v).replace(/%20/g, "+");
  return `Basic ${btoa(`${encode(clientId)}:${encode(secret)}`)}`;
}

/** Exchanges the authorization code (with the PKCE verifier) for tokens; returns the ID token. */
export async function exchangeCode(
  discovery: Discovery,
  input: { code: string; redirectUri: string; verifier: string; clientId: string; clientSecret: string },
): Promise<string> {
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    code_verifier: input.verifier,
  });
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    accept: "application/json",
  };
  const methods = discovery.token_endpoint_auth_methods_supported ?? ["client_secret_basic"];
  if (methods.includes("client_secret_basic")) {
    headers.authorization = basicAuth(input.clientId, input.clientSecret);
  } else if (methods.includes("client_secret_post")) {
    form.set("client_id", input.clientId);
    form.set("client_secret", input.clientSecret);
  } else {
    throw new OidcError("The provider supports neither client_secret_basic nor client_secret_post");
  }
  const { status, body } = await getJson(discovery.token_endpoint, { method: "POST", headers, body: form });
  const idToken = (body as { id_token?: unknown }).id_token;
  if (status !== 200 || typeof idToken !== "string") {
    const error = (body as { error?: unknown }).error;
    throw new OidcError(`The token endpoint refused the code${typeof error === "string" ? ` (${error.slice(0, 60)})` : ""}`);
  }
  return idToken;
}

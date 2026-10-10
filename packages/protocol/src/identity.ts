import type { Attributes } from "./types";

// Identity verification, like Intercom's: your backend signs who the user is with
// IDENTITY_SECRET (shared with the support worker), and the widget or app hands that
// token over. Without it, a visitor could claim to be anyone.
//
// The token is a compact HS256 JWT. Only Web Crypto is used, so this runs in
// Cloudflare Workers, Node 20+, Deno and browsers.

export interface UserIdentityClaims {
  /** Your stable user id (for example the Clerk user id). */
  userId: string;
  email?: string | null;
  name?: string | null;
  avatarUrl?: string | null;
  /** Extra facts shown to the team, for example plan or app version. */
  attributes?: Attributes;
}

export interface VerifiedUserIdentity extends UserIdentityClaims {
  issuedAt: number;
  expiresAt: number;
}

interface JwtPayload {
  sub: string;
  email?: string | null;
  name?: string | null;
  avatar_url?: string | null;
  attributes?: Attributes;
  iat: number;
  exp: number;
  aud: string;
}

/** The `aud` claim of identity tokens. */
export const IDENTITY_AUDIENCE = "yunidesk";
const MAX_LIFETIME_SECONDS = 7 * 24 * 3600;
const encoder = new TextEncoder();

export async function signUserToken(
  claims: UserIdentityClaims,
  secret: string,
  options: { expiresInSeconds?: number; now?: number } = {},
): Promise<string> {
  if (!claims.userId) throw new Error("userId is required");
  const iat = Math.floor((options.now ?? Date.now()) / 1000);
  const lifetime = Math.min(options.expiresInSeconds ?? 3600, MAX_LIFETIME_SECONDS);
  const payload: JwtPayload = {
    sub: claims.userId,
    email: claims.email ?? null,
    name: claims.name ?? null,
    avatar_url: claims.avatarUrl ?? null,
    attributes: claims.attributes ?? {},
    iat,
    exp: iat + lifetime,
    aud: IDENTITY_AUDIENCE,
  };
  const head = base64UrlEncodeString(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64UrlEncodeString(JSON.stringify(payload));
  const signature = await hmac(secret, `${head}.${body}`);
  return `${head}.${body}.${base64UrlEncodeBytes(signature)}`;
}

/** Returns null for anything that is not a valid, unexpired token signed with `secret`. */
export async function verifyUserToken(
  token: string,
  secret: string,
  now = Date.now(),
  options: {
    maxLifetimeSeconds?: number;
    /** Extra `aud` values to accept, e.g. while migrating from another audience name. */
    extraAudiences?: readonly string[];
  } = {},
): Promise<VerifiedUserIdentity | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, body, signature] = parts as [string, string, string];

  let header: { alg?: unknown };
  let payload: Partial<JwtPayload>;
  try {
    header = JSON.parse(base64UrlDecodeString(head));
    payload = JSON.parse(base64UrlDecodeString(body));
  } catch {
    return null;
  }
  if (header.alg !== "HS256") return null;

  let given: Uint8Array<ArrayBuffer>;
  try {
    given = base64UrlDecodeBytes(signature);
  } catch {
    return null;
  }
  const key = await importKey(secret);
  const valid = await crypto.subtle.verify("HMAC", key, given, encoder.encode(`${head}.${body}`));
  if (!valid) return null;

  const nowSeconds = Math.floor(now / 1000);
  if (typeof payload.sub !== "string" || !payload.sub) return null;
  if (payload.aud !== IDENTITY_AUDIENCE && !(options.extraAudiences ?? []).includes(String(payload.aud))) return null;
  if (typeof payload.exp !== "number" || payload.exp <= nowSeconds) return null;
  if (typeof payload.iat !== "number" || payload.iat > nowSeconds + 60) return null;
  if (payload.exp - payload.iat > Math.min(options.maxLifetimeSeconds ?? MAX_LIFETIME_SECONDS, MAX_LIFETIME_SECONDS)) return null;

  return {
    userId: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
    name: typeof payload.name === "string" ? payload.name : null,
    avatarUrl: typeof payload.avatar_url === "string" ? payload.avatar_url : null,
    attributes: isAttributes(payload.attributes) ? payload.attributes : {},
    issuedAt: payload.iat * 1000,
    expiresAt: payload.exp * 1000,
  };
}

function isAttributes(value: unknown): value is Attributes {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every(
    (v) => v === null || ["string", "number", "boolean"].includes(typeof v),
  );
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await importKey(secret);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlEncodeString(value: string): string {
  return base64UrlEncodeBytes(encoder.encode(value));
}

function base64UrlDecodeBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

function base64UrlDecodeString(value: string): string {
  return new TextDecoder().decode(base64UrlDecodeBytes(value));
}

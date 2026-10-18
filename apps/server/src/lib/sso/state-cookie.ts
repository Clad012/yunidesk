import { getCookie, deleteCookie, setCookie } from "hono/cookie";
import type { AppContext } from "../../app-env";
import { constantTimeEqual, fromBase64Url, hmac, randomToken, sha256, toBase64Url } from "../crypto";

/**
 * The state of one SSO sign-in between /start and /callback: the state value, the nonce and the
 * PKCE verifier, in a short-lived HttpOnly cookie signed with SESSION_SECRET. SameSite=Lax so it
 * comes back on the provider's top-level redirect to the callback.
 */
export interface SsoState {
  state: string;
  nonce: string;
  verifier: string;
  /** Epoch ms. */
  exp: number;
}

const LIFETIME_S = 600;
const PURPOSE = "yunidesk/sso-state:";
const encoder = new TextEncoder();

function isSecure(c: AppContext): boolean {
  return new URL(c.req.url).protocol === "https:";
}

function cookieName(c: AppContext): string {
  return isSecure(c) ? "__Host-ys_sso" : "ys_sso";
}

export function newSsoState(now = Date.now()): SsoState {
  return { state: randomToken(32), nonce: randomToken(32), verifier: randomToken(48), exp: now + LIFETIME_S * 1000 };
}

/** RFC 7636 S256: base64url(SHA-256(verifier)). */
export function codeChallenge(verifier: string): Promise<string> {
  return sha256(verifier);
}

export async function encodeSsoState(secret: string, value: SsoState): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify(value)));
  return `${payload}.${await hmac(secret, PURPOSE + payload)}`;
}

/** Null when the cookie is missing, tampered with, expired or for another sign-in (`state` differs). */
export async function decodeSsoState(secret: string, raw: string | undefined, state: string, now = Date.now()): Promise<SsoState | null> {
  if (!raw) return null;
  const [payload, signature] = raw.split(".");
  if (!payload || !signature) return null;
  if (!constantTimeEqual(signature, await hmac(secret, PURPOSE + payload))) return null;
  let value: SsoState;
  try {
    value = JSON.parse(new TextDecoder().decode(fromBase64Url(payload))) as SsoState;
  } catch {
    return null;
  }
  if (typeof value.exp !== "number" || value.exp < now) return null;
  if (typeof value.state !== "string" || !constantTimeEqual(value.state, state)) return null;
  return value;
}

export async function setSsoCookie(c: AppContext, value: SsoState): Promise<void> {
  setCookie(c, cookieName(c), await encodeSsoState(c.env.SESSION_SECRET, value), {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: "Lax",
    path: "/",
    maxAge: LIFETIME_S,
  });
}

/** Reads and clears the cookie: each sign-in attempt is used once. */
export function takeSsoCookie(c: AppContext): string | undefined {
  const raw = getCookie(c, cookieName(c));
  deleteCookie(c, cookieName(c), { path: "/", secure: isSecure(c) });
  return raw;
}

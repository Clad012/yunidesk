import { SignJWT, jwtVerify } from "jose";
import { hmac, constantTimeEqual } from "./crypto";

// Tokens this worker issues to contacts, all signed with SESSION_SECRET.
// - session: bearer token for the contact API (short for identified users, who can re-prove identity)
// - visitor: kept by an anonymous visitor's browser to get back to the same contact
// - ws: one-minute ticket to open a websocket (browsers can't set headers on websockets)

type TokenType = "session" | "visitor" | "ws";

const LIFETIME_SECONDS: Record<TokenType, number> = {
  session: 12 * 3600,
  visitor: 180 * 24 * 3600,
  ws: 60,
};

const ISSUER = "yunidesk";

export interface ContactTokenClaims {
  contactId: string;
  identified: boolean;
}

export async function issueContactToken(
  secret: string,
  type: TokenType,
  claims: ContactTokenClaims,
): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + LIFETIME_SECONDS[type];
  const token = await new SignJWT({ typ: type, idf: claims.identified ? 1 : 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setSubject(claims.contactId)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(new TextEncoder().encode(secret));
  return { token, expiresAt: exp * 1000 };
}

export async function verifyContactToken(
  secret: string,
  type: TokenType,
  token: string,
  /** Earlier issuer names still accepted (LEGACY_TOKEN_ISSUERS), so a rename doesn't sign everyone out. */
  legacyIssuers: readonly string[] = [],
): Promise<ContactTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      issuer: [ISSUER, ...legacyIssuers],
      algorithms: ["HS256"],
    });
    if (payload.typ !== type || typeof payload.sub !== "string") return null;
    return { contactId: payload.sub, identified: payload.idf === 1 };
  } catch {
    return null;
  }
}

// ---- Email confirmation links ----

const VERIFY_LIFETIME_SECONDS = 24 * 3600;

export async function issueEmailVerifyToken(secret: string, contactId: string, email: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ typ: "verify", email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(ISSUER)
    .setSubject(contactId)
    .setIssuedAt(now)
    .setExpirationTime(now + VERIFY_LIFETIME_SECONDS)
    .sign(new TextEncoder().encode(secret));
}

export async function verifyEmailVerifyToken(
  secret: string,
  token: string,
): Promise<{ contactId: string; email: string } | null> {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { issuer: ISSUER, algorithms: ["HS256"] });
    if (payload.typ !== "verify" || typeof payload.sub !== "string" || typeof payload.email !== "string") return null;
    return { contactId: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}

// ---- Signed file links ----
// Attachments are private. Links carry an expiry and an HMAC so <img src> works without headers.
// The expiry is rounded up to the hour so the same file gets the same URL for a while (browser cache).

const FILE_LINK_LIFETIME_MS = 12 * 3600 * 1000;
const HOUR_MS = 3600 * 1000;

export async function signFilePath(secret: string, attachmentId: string, now = Date.now()): Promise<string> {
  const exp = Math.ceil((now + FILE_LINK_LIFETIME_MS) / HOUR_MS) * HOUR_MS;
  const sig = await hmac(secret, `file:${attachmentId}:${exp}`);
  return `/api/files/${attachmentId}?exp=${exp}&sig=${sig}`;
}

export async function verifyFileSignature(
  secret: string,
  attachmentId: string,
  exp: string | undefined,
  sig: string | undefined,
  now = Date.now(),
): Promise<boolean> {
  if (!exp || !sig || !/^\d+$/.test(exp)) return false;
  if (Number(exp) < now) return false;
  const expected = await hmac(secret, `file:${attachmentId}:${exp}`);
  return constantTimeEqual(expected, sig);
}

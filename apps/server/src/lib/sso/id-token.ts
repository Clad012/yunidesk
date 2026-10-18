import { fromBase64Url } from "../crypto";

/**
 * OpenID Connect ID token verification with WebCrypto only (RS256, ES256). Every check is
 * explicit here so a test can prove each one: algorithm allow-list, key by kid, signature,
 * issuer, audience (and azp when there are several audiences), expiry, issued-at, nonce.
 */

export interface Jwk {
  kty: string;
  kid?: string;
  use?: string;
  alg?: string;
  n?: string;
  e?: string;
  crv?: string;
  x?: string;
  y?: string;
}

export interface IdTokenClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  nonce?: string;
  azp?: string;
  email?: string;
  email_verified?: boolean | string;
  /** Microsoft Entra ID: the email's domain is verified by the tenant. */
  xms_edov?: boolean | string;
  name?: string;
}

export type IdTokenFailure =
  | "malformed"
  | "alg"
  | "key"
  | "signature"
  | "issuer"
  | "audience"
  | "expired"
  | "issued_at"
  | "nonce";

export class IdTokenError extends Error {
  constructor(readonly reason: IdTokenFailure) {
    super(`ID token rejected: ${reason}`);
  }
}

export interface VerifyOptions {
  issuer: string;
  clientId: string;
  nonce: string;
  keys: readonly Jwk[];
  /** Epoch ms. */
  now: number;
  /** Clock difference tolerated on exp and iat. */
  skewSeconds?: number;
}

const ALGORITHMS = {
  RS256: {
    kty: "RSA",
    importParams: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    verifyParams: { name: "RSASSA-PKCS1-v1_5" },
  },
  ES256: {
    kty: "EC",
    importParams: { name: "ECDSA", namedCurve: "P-256" },
    verifyParams: { name: "ECDSA", hash: "SHA-256" },
  },
} as const;
type Algorithm = keyof typeof ALGORITHMS;

const decoder = new TextDecoder();
const encoder = new TextEncoder();

function parseJson(segment: string): Record<string, unknown> {
  try {
    const value = JSON.parse(decoder.decode(fromBase64Url(segment))) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not an object");
    return value as Record<string, unknown>;
  } catch {
    throw new IdTokenError("malformed");
  }
}

/** The key that signed the token: by kid, or the only usable key of the right type when there's no kid. */
function pickKey(keys: readonly Jwk[], alg: Algorithm, kid: unknown): Jwk {
  const usable = keys.filter(
    (k) =>
      k.kty === ALGORITHMS[alg].kty &&
      (k.use === undefined || k.use === "sig") &&
      (k.alg === undefined || k.alg === alg) &&
      (alg !== "ES256" || k.crv === "P-256"),
  );
  const matches = typeof kid === "string" ? usable.filter((k) => k.kid === kid) : usable;
  if (matches.length !== 1) throw new IdTokenError("key");
  return matches[0]!;
}

async function importKey(jwk: Jwk, alg: Algorithm): Promise<CryptoKey> {
  const material: JsonWebKey =
    alg === "RS256" ? { kty: "RSA", n: jwk.n, e: jwk.e } : { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y };
  // RSA keys under 2048 bits are refused.
  if (alg === "RS256" && (!jwk.n || fromBase64Url(jwk.n).length < 256)) throw new IdTokenError("key");
  try {
    return await crypto.subtle.importKey("jwk", material, ALGORITHMS[alg].importParams, false, ["verify"]);
  } catch {
    throw new IdTokenError("key");
  }
}

export async function verifyIdToken(token: string, options: VerifyOptions): Promise<IdTokenClaims> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) throw new IdTokenError("malformed");
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const header = parseJson(headerPart);

  const alg = header.alg;
  if (alg !== "RS256" && alg !== "ES256") throw new IdTokenError("alg");
  const key = await importKey(pickKey(options.keys, alg, header.kid), alg);

  const signature = fromBase64Url(signaturePart);
  if (alg === "ES256" && signature.length !== 64) throw new IdTokenError("signature");
  const valid = await crypto.subtle.verify(
    ALGORITHMS[alg].verifyParams,
    key,
    signature,
    encoder.encode(`${headerPart}.${payloadPart}`),
  );
  if (!valid) throw new IdTokenError("signature");

  const claims = parseJson(payloadPart) as Partial<IdTokenClaims>;
  if (claims.iss !== options.issuer) throw new IdTokenError("issuer");

  const audiences = typeof claims.aud === "string" ? [claims.aud] : Array.isArray(claims.aud) ? claims.aud : [];
  if (!audiences.includes(options.clientId)) throw new IdTokenError("audience");
  // Several audiences: the token must have been issued to us (OIDC Core 3.1.3.7).
  if ((audiences.length > 1 || claims.azp !== undefined) && claims.azp !== options.clientId) {
    throw new IdTokenError("audience");
  }

  const skew = options.skewSeconds ?? 60;
  const nowSeconds = options.now / 1000;
  if (typeof claims.exp !== "number" || nowSeconds > claims.exp + skew) throw new IdTokenError("expired");
  if (typeof claims.iat !== "number" || claims.iat > nowSeconds + skew) throw new IdTokenError("issued_at");

  if (typeof claims.nonce !== "string" || claims.nonce !== options.nonce) throw new IdTokenError("nonce");
  if (typeof claims.sub !== "string" || !claims.sub) throw new IdTokenError("malformed");
  return claims as IdTokenClaims;
}

/** `email_verified` true (some providers send the string "true"), or Entra's verified-domain claim. */
export function hasVerifiedEmail(claims: IdTokenClaims): boolean {
  const truthy = (value: unknown) => value === true || value === "true";
  return typeof claims.email === "string" && (truthy(claims.email_verified) || truthy(claims.xms_edov));
}

/** The email's domain is one of `allowed` (exact match, case-insensitive). */
export function isAllowedDomain(email: string, allowed: readonly string[]): boolean {
  const at = email.lastIndexOf("@");
  if (at < 1) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return allowed.some((d) => d.toLowerCase() === domain);
}

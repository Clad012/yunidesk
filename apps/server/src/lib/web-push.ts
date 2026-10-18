import { fromBase64Url, toBase64Url } from "./crypto";

/**
 * Web Push with WebCrypto only: message encryption (RFC 8291, `aes128gcm` from RFC 8188) and
 * VAPID application server identification (RFC 8292). No dependency, runs on Workers.
 */

const encoder = new TextEncoder();
/** One record holds the whole message: push services accept at most 4096 bytes. */
const RECORD_SIZE = 4096;
/** Header (86) + padding delimiter (1) + GCM tag (16) must fit in one record. */
export const MAX_PUSH_PLAINTEXT = RECORD_SIZE - 86 - 1 - 16;
/** RFC 8292: a VAPID token lives at most 24 hours. */
const VAPID_TOKEN_SECONDS = 12 * 3600;

/** The browser's subscription keys, base64url as `PushSubscription.toJSON()` gives them. */
export interface SubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface VapidKeys {
  /** Uncompressed P-256 point, base64url (65 bytes). */
  publicKey: string;
  /** ECDSA P-256 private key for signing. */
  privateKey: CryptoKey;
}

/** Fixed inputs, only for the RFC test vectors; real sends use fresh random values. */
export interface EncryptionOverrides {
  salt?: Uint8Array;
  serverKeys?: { publicKey: Uint8Array; privateKey: CryptoKey };
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const hmacKey = await crypto.subtle.importKey("raw", concat(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", hmacKey, concat(data)));
}

/** HKDF-SHA-256 with an output of at most one hash block, as every step of RFC 8291 needs. */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const prk = await hmacSha256(salt, ikm);
  return (await hmacSha256(prk, concat(info, new Uint8Array([1])))).slice(0, length);
}

/** Splits an uncompressed P-256 point (0x04 || x || y) into a public JWK. */
export function pointToJwk(point: Uint8Array): JsonWebKey {
  if (point.length !== 65 || point[0] !== 4) throw new Error("Expected an uncompressed P-256 point");
  return { kty: "EC", crv: "P-256", x: toBase64Url(point.slice(1, 33)), y: toBase64Url(point.slice(33)), ext: true };
}

/** A private key from its scalar `d` and its public point. */
export function importPrivateKey(d: string, publicPoint: Uint8Array, algorithm: "ECDH" | "ECDSA"): Promise<CryptoKey> {
  const jwk: JsonWebKey = { ...pointToJwk(publicPoint), d };
  return algorithm === "ECDH"
    ? crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"])
    : crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

/** Accepts subscription keys only when they have the right shape (65-byte point, 16-byte secret). */
export function isValidSubscriptionKeys(keys: SubscriptionKeys): boolean {
  try {
    const point = fromBase64Url(keys.p256dh);
    return point.length === 65 && point[0] === 4 && fromBase64Url(keys.auth).length === 16;
  } catch {
    return false;
  }
}

/** RFC 8291 §3–4: one `aes128gcm` record a push service can carry to the browser. */
export async function encryptPushMessage(
  plaintext: Uint8Array,
  keys: SubscriptionKeys,
  overrides: EncryptionOverrides = {},
): Promise<Uint8Array> {
  if (plaintext.length > MAX_PUSH_PLAINTEXT) throw new Error("Push message is too long");
  const uaPublic = fromBase64Url(keys.p256dh);
  const authSecret = fromBase64Url(keys.auth);
  const uaKey = await crypto.subtle.importKey("jwk", pointToJwk(uaPublic), { name: "ECDH", namedCurve: "P-256" }, false, []);

  let server = overrides.serverKeys;
  if (!server) {
    const pair = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
    server = { publicKey: new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey) as ArrayBuffer), privateKey: pair.privateKey };
  }
  const salt = overrides.salt ?? crypto.getRandomValues(new Uint8Array(16));

  // Standard WebCrypto names the peer key `public`; the Workers types spell it `$public`. Pass both.
  const ecdh = { name: "ECDH", public: uaKey, $public: uaKey } as SubtleCryptoDeriveKeyAlgorithm;
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(ecdh, server.privateKey, 256));
  const keyInfo = concat(encoder.encode("WebPush: info\0"), uaPublic, server.publicKey);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  const cek = await hkdf(salt, ikm, encoder.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, encoder.encode("Content-Encoding: nonce\0"), 12);

  const aesKey = await crypto.subtle.importKey("raw", concat(cek), "AES-GCM", false, ["encrypt"]);
  // 0x02: this is the last (and only) record; no further padding.
  const padded = concat(plaintext, new Uint8Array([2]));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: concat(nonce) }, aesKey, padded));

  const header = new Uint8Array(16 + 4 + 1);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = server.publicKey.length;
  return concat(header, server.publicKey, ciphertext);
}

/** RFC 8292: an ES256 JWT for the push service's origin, signed with our VAPID key. */
export async function vapidAuthorization(endpoint: string, vapid: VapidKeys, subject: string, now = Date.now()): Promise<string> {
  const header = toBase64Url(encoder.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = toBase64Url(
    encoder.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + VAPID_TOKEN_SECONDS, sub: subject })),
  );
  const signingInput = `${header}.${claims}`;
  // WebCrypto returns the raw r || s form JWS wants (not DER).
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, vapid.privateKey, encoder.encode(signingInput));
  return `vapid t=${signingInput}.${toBase64Url(new Uint8Array(signature))}, k=${vapid.publicKey}`;
}

export interface PushRequestOptions {
  /** Seconds the push service keeps the message for an offline device. */
  ttl: number;
  urgency: "very-low" | "low" | "normal" | "high";
  /** Replaces an undelivered message with the same topic (URL-safe base64 alphabet, ≤ 32 chars). */
  topic?: string;
  /** VAPID `sub`: an https URL or mailto: address the push service can reach us at. */
  subject: string;
}

export async function buildPushRequest(
  endpoint: string,
  keys: SubscriptionKeys,
  payload: string,
  vapid: VapidKeys,
  options: PushRequestOptions,
): Promise<Request> {
  const body = await encryptPushMessage(encoder.encode(payload), keys);
  const headers = new Headers({
    authorization: await vapidAuthorization(endpoint, vapid, options.subject),
    "content-encoding": "aes128gcm",
    "content-type": "application/octet-stream",
    ttl: String(options.ttl),
    urgency: options.urgency,
  });
  if (options.topic && /^[A-Za-z0-9_-]{1,32}$/.test(options.topic)) headers.set("topic", options.topic);
  return new Request(endpoint, { method: "POST", headers, body });
}

export type PushOutcome = "delivered" | "gone" | "failed";

/** 404/410: the subscription is gone for good. Anything else that isn't 2xx counts as a failure. */
export function classifyPushResponse(status: number): PushOutcome {
  if (status >= 200 && status < 300) return "delivered";
  if (status === 404 || status === 410) return "gone";
  return "failed";
}

/**
 * Push endpoints come from the browser, so they are untrusted URLs we will POST to: https only,
 * no credentials, no explicit port, no IP literals, no single-label, local or private names.
 */
export function isAllowedPushEndpoint(value: string, ownHost: string): boolean {
  if (value.length > 1024) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
  if (host === ownHost || !host.includes(".") || host.endsWith(".")) return false;
  if (/^[\d.]+$/.test(host) || host.startsWith("[")) return false;
  return !/(^|\.)(localhost|local|internal|intranet|lan|home|corp|private|test|invalid|example|onion|arpa)$/.test(host);
}

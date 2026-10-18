import { describe, expect, it } from "vitest";
import { csvField } from "../src/lib/audit";
import { toBase64Url } from "../src/lib/crypto";
import { hasVerifiedEmail, isAllowedDomain, verifyIdToken, type IdTokenClaims, type Jwk } from "../src/lib/sso/id-token";
import { decodeSsoState, encodeSsoState, newSsoState } from "../src/lib/sso/state-cookie";

const ISSUER = "https://idp.example.com";
const CLIENT = "client-123";
const NONCE = "nonce-abc";
const NOW = Date.UTC(2026, 9, 18, 12, 0);
const encoder = new TextEncoder();

const b64json = (value: object) => toBase64Url(encoder.encode(JSON.stringify(value)));

async function rsaKey(kid: string) {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as Jwk;
  return { privateKey: pair.privateKey, jwk: { kty: "RSA", n: jwk.n, e: jwk.e, kid, use: "sig", alg: "RS256" } as Jwk };
}

async function ecKey(kid: string) {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as Jwk;
  return { privateKey: pair.privateKey, jwk: { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, kid } as Jwk };
}

const claims = (overrides: Partial<IdTokenClaims> = {}): IdTokenClaims => ({
  iss: ISSUER,
  sub: "user-1",
  aud: CLIENT,
  exp: NOW / 1000 + 300,
  iat: NOW / 1000 - 10,
  nonce: NONCE,
  email: "ana@example.com",
  email_verified: true,
  ...overrides,
});

async function sign(alg: "RS256" | "ES256", key: CryptoKey, payload: object, header: object = {}): Promise<string> {
  const input = `${b64json({ alg, typ: "JWT", ...header })}.${b64json(payload)}`;
  const params = alg === "RS256" ? { name: "RSASSA-PKCS1-v1_5" } : { name: "ECDSA", hash: "SHA-256" };
  const signature = new Uint8Array(await crypto.subtle.sign(params, key, encoder.encode(input)));
  return `${input}.${toBase64Url(signature)}`;
}

describe("ID token verification", async () => {
  const rsa = await rsaKey("rsa-1");
  const ec = await ecKey("ec-1");
  const keys = [rsa.jwk, ec.jwk];
  const options = { issuer: ISSUER, clientId: CLIENT, nonce: NONCE, keys, now: NOW };
  const rsToken = (payload: object, header: object = { kid: "rsa-1" }) => sign("RS256", rsa.privateKey, payload, header);
  const reason = (token: string, opts: Partial<typeof options> = {}) =>
    verifyIdToken(token, { ...options, ...opts }).then(
      () => "accepted",
      (error: { reason?: string }) => error.reason ?? "threw",
    );

  it("accepts a good RS256 and ES256 token", async () => {
    expect((await verifyIdToken(await rsToken(claims()), options)).email).toBe("ana@example.com");
    const es = await sign("ES256", ec.privateKey, claims(), { kid: "ec-1" });
    expect((await verifyIdToken(es, options)).sub).toBe("user-1");
  });

  it("rejects the wrong issuer, audience or nonce", async () => {
    expect(await reason(await rsToken(claims({ iss: "https://evil.example.com" })))).toBe("issuer");
    expect(await reason(await rsToken(claims({ aud: "someone-else" })))).toBe("audience");
    expect(await reason(await rsToken(claims({ aud: ["someone-else", CLIENT] })))).toBe("audience"); // no azp
    expect(await reason(await rsToken(claims({ aud: ["someone-else", CLIENT], azp: CLIENT })))).toBe("accepted");
    expect(await reason(await rsToken(claims({ nonce: "replayed" })))).toBe("nonce");
    expect(await reason(await rsToken(claims({ nonce: undefined })))).toBe("nonce");
  });

  it("rejects expired tokens and tokens from the future, with a minute of skew", async () => {
    expect(await reason(await rsToken(claims({ exp: NOW / 1000 - 61 })))).toBe("expired");
    expect(await reason(await rsToken(claims({ exp: NOW / 1000 - 30 })))).toBe("accepted");
    expect(await reason(await rsToken(claims({ iat: NOW / 1000 + 120 })))).toBe("issued_at");
    expect(await reason(await rsToken(claims({ iat: undefined as unknown as number })))).toBe("issued_at");
  });

  it("rejects alg none, HS256 and an algorithm/key mismatch", async () => {
    const unsigned = `${b64json({ alg: "none", kid: "rsa-1" })}.${b64json(claims())}.`;
    expect(await reason(unsigned)).toBe("malformed");
    expect(await reason(`${b64json({ alg: "none", kid: "rsa-1" })}.${b64json(claims())}.AA`)).toBe("alg");
    expect(await reason(`${b64json({ alg: "HS256", kid: "rsa-1" })}.${b64json(claims())}.AA`)).toBe("alg");
    // An RS256 header pointing at the EC key: no usable key.
    expect(await reason(await rsToken(claims(), { kid: "ec-1" }))).toBe("key");
  });

  it("rejects unknown keys and tampered signatures or payloads", async () => {
    expect(await reason(await rsToken(claims(), { kid: "rotated-away" }))).toBe("key");
    const other = await rsaKey("rsa-1");
    expect(await reason(await sign("RS256", other.privateKey, claims(), { kid: "rsa-1" }))).toBe("signature");
    const [h, , s] = (await rsToken(claims())).split(".");
    expect(await reason(`${h}.${b64json(claims({ email: "boss@example.com" }))}.${s}`)).toBe("signature");
  });

  it("uses the only key of the right type when the token has no kid", async () => {
    expect(await reason(await rsToken(claims(), {}), { keys: [rsa.jwk, ec.jwk] })).toBe("accepted");
    const p384 = { ...ec.jwk, crv: "P-384", kid: undefined };
    const es = await sign("ES256", ec.privateKey, claims(), {});
    expect(await reason(es, { keys: [p384, { ...ec.jwk, kid: undefined }] })).toBe("accepted");
    const second = await rsaKey("rsa-2");
    expect(await reason(await rsToken(claims(), {}), { keys: [rsa.jwk, second.jwk] })).toBe("key");
  });
});

describe("who may sign in", () => {
  it("needs a verified email in an allowed domain", () => {
    expect(hasVerifiedEmail(claims())).toBe(true);
    expect(hasVerifiedEmail(claims({ email_verified: "true" }))).toBe(true);
    expect(hasVerifiedEmail(claims({ email_verified: false }))).toBe(false);
    expect(hasVerifiedEmail(claims({ email_verified: undefined }))).toBe(false);
    expect(hasVerifiedEmail(claims({ email_verified: undefined, xms_edov: true }))).toBe(true);
    expect(isAllowedDomain("ana@Example.com", ["example.com"])).toBe(true);
    expect(isAllowedDomain("ana@example.com.evil.io", ["example.com"])).toBe(false);
    expect(isAllowedDomain("ana@sub.example.com", ["example.com"])).toBe(false);
    expect(isAllowedDomain("example.com", ["example.com"])).toBe(false);
  });
});

describe("SSO state cookie", () => {
  const secret = "session-secret-for-tests-0123456789abcdef";

  it("comes back only untouched, unexpired and for the same state", async () => {
    const value = newSsoState(NOW);
    const raw = await encodeSsoState(secret, value);
    expect(await decodeSsoState(secret, raw, value.state, NOW)).toEqual(value);
    expect(await decodeSsoState(secret, raw, "other-state", NOW)).toBeNull();
    expect(await decodeSsoState(secret, raw, value.state, value.exp + 1)).toBeNull();
    expect(await decodeSsoState("another-secret-0123456789abcdef0123", raw, value.state, NOW)).toBeNull();
    const forged = `${b64json({ ...value, nonce: "mine" })}.${raw.split(".")[1]}`;
    expect(await decodeSsoState(secret, forged, value.state, NOW)).toBeNull();
    expect(await decodeSsoState(secret, undefined, value.state, NOW)).toBeNull();
  });
});

describe("audit CSV export", () => {
  it("defuses spreadsheet formulas and quotes separators", () => {
    expect(csvField("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvField("+1")).toBe("'+1");
    expect(csvField("@cmd")).toBe("'@cmd");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField("plain")).toBe("plain");
    expect(csvField(null)).toBe("");
  });
});

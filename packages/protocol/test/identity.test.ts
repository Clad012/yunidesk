import { describe, expect, it } from "vitest";
import { signUserToken, verifyUserToken } from "../src/identity";

const SECRET = "test-secret-that-is-long-enough-123";
const NOW = Date.UTC(2026, 9, 10, 12);

describe("identity tokens", () => {
  it("round-trips the claims", async () => {
    const token = await signUserToken({ userId: "u1", email: "a@b.co", attributes: { plan: "pro" } }, SECRET, { now: NOW });
    const identity = await verifyUserToken(token, SECRET, NOW + 1000);
    expect(identity).toMatchObject({ userId: "u1", email: "a@b.co", attributes: { plan: "pro" } });
  });

  it("rejects a token whose payload was changed", async () => {
    const token = await signUserToken({ userId: "u1" }, SECRET, { now: NOW });
    const [head, , sig] = token.split(".");
    const forged = btoa(JSON.stringify({ sub: "admin", aud: "yunidesk", iat: NOW / 1000, exp: NOW / 1000 + 60 }))
      .replace(/=+$/, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");
    expect(await verifyUserToken(`${head}.${forged}.${sig}`, SECRET, NOW)).toBeNull();
  });

  it("rejects another secret, expiry and unsigned tokens", async () => {
    const token = await signUserToken({ userId: "u1" }, SECRET, { now: NOW, expiresInSeconds: 60 });
    expect(await verifyUserToken(token, "another-secret-of-decent-length-xx", NOW)).toBeNull();
    expect(await verifyUserToken(token, SECRET, NOW + 61_000)).toBeNull();
    const [, body] = token.split(".");
    const none = btoa(JSON.stringify({ alg: "none", typ: "JWT" })).replace(/=+$/, "");
    expect(await verifyUserToken(`${none}.${body}.`, SECRET, NOW)).toBeNull();
  });

  it("rejects a correctly signed token that lives longer than seven days", async () => {
    const iat = NOW / 1000;
    const token = await signRaw({ sub: "u1", aud: "yunidesk", iat, exp: iat + 30 * 24 * 3600 });
    expect(await verifyUserToken(token, SECRET, NOW)).toBeNull();
    // Same token shape with a normal lifetime is accepted, so the rejection above is the lifetime rule.
    expect(await verifyUserToken(await signRaw({ sub: "u1", aud: "yunidesk", iat, exp: iat + 3600 }), SECRET, NOW)).not.toBeNull();
  });

  it("caps the lifetime at seven days", async () => {
    const token = await signUserToken({ userId: "u1" }, SECRET, { now: NOW, expiresInSeconds: 30 * 24 * 3600 });
    const identity = await verifyUserToken(token, SECRET, NOW);
    expect(identity!.expiresAt - identity!.issuedAt).toBe(7 * 24 * 3600 * 1000);
  });
});

const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

async function signRaw(payload: object): Promise<string> {
  const enc = new TextEncoder();
  const head = b64(enc.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = b64(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey("raw", enc.encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${head}.${body}`)));
  return `${head}.${body}.${b64(sig)}`;
}

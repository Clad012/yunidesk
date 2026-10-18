import { describe, expect, it } from "vitest";
import { fromBase64Url, toBase64Url } from "../src/lib/crypto";
import {
  classifyPushResponse,
  encryptPushMessage,
  importPrivateKey,
  isAllowedPushEndpoint,
  pointToJwk,
  vapidAuthorization,
} from "../src/lib/web-push";

// RFC 8291 §5 and Appendix A: fixed keys and salt, so the output is known byte for byte.
const RFC = {
  plaintext: "When I grow up, I want to be a watermelon",
  asPublic: "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  body:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" +
    "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT" +
    "pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

describe("RFC 8291 message encryption", () => {
  it("produces the exact ciphertext of the RFC example", async () => {
    const asPublic = fromBase64Url(RFC.asPublic);
    const body = await encryptPushMessage(
      new TextEncoder().encode(RFC.plaintext),
      { p256dh: RFC.uaPublic, auth: RFC.auth },
      { salt: fromBase64Url(RFC.salt), serverKeys: { publicKey: asPublic, privateKey: await importPrivateKey(RFC.asPrivate, asPublic, "ECDH") } },
    );
    expect(toBase64Url(body)).toBe(RFC.body);
  });

  it("uses a fresh salt and key for every message", async () => {
    const keys = { p256dh: RFC.uaPublic, auth: RFC.auth };
    const message = new TextEncoder().encode(RFC.plaintext);
    const [a, b] = await Promise.all([encryptPushMessage(message, keys), encryptPushMessage(message, keys)]);
    expect(toBase64Url(a.slice(0, 16))).not.toBe(toBase64Url(b.slice(0, 16)));
    expect(toBase64Url(a.slice(21, 86))).not.toBe(toBase64Url(b.slice(21, 86)));
  });
});

describe("VAPID (RFC 8292)", () => {
  it("signs an ES256 token for the push service's origin that verifies with the announced key", async () => {
    const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
    const publicKey = toBase64Url(new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer));
    const now = Date.UTC(2026, 9, 18, 9, 0);
    const header = await vapidAuthorization("https://push.example.net/send/abc?x=1", { publicKey, privateKey: pair.privateKey }, "https://support.example.org", now);

    const match = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header);
    expect(match).not.toBeNull();
    const [, h, c, s, k] = match!;
    expect(k).toBe(publicKey);
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(c!))) as { aud: string; exp: number; sub: string };
    expect(claims.aud).toBe("https://push.example.net");
    expect(claims.exp - now / 1000).toBeGreaterThan(0);
    expect(claims.exp - now / 1000).toBeLessThanOrEqual(24 * 3600);
    expect(JSON.parse(new TextDecoder().decode(fromBase64Url(h!)))).toEqual({ typ: "JWT", alg: "ES256" });

    const verifyKey = await crypto.subtle.importKey("jwk", pointToJwk(fromBase64Url(k!)), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, verifyKey, fromBase64Url(s!), new TextEncoder().encode(`${h}.${c}`));
    expect(valid).toBe(true);
  });
});

describe("push service answers", () => {
  it("drops gone subscriptions and counts everything else that failed", () => {
    expect(classifyPushResponse(201)).toBe("delivered");
    expect(classifyPushResponse(404)).toBe("gone");
    expect(classifyPushResponse(410)).toBe("gone");
    expect(classifyPushResponse(429)).toBe("failed");
    expect(classifyPushResponse(503)).toBe("failed");
    expect(classifyPushResponse(403)).toBe("failed");
  });
});

describe("push endpoints (anti-SSRF)", () => {
  const own = "support.example.org";
  it("accepts the real push services", () => {
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com/fcm/send/abc:def", own)).toBe(true);
    expect(isAllowedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/gAAAA", own)).toBe(true);
    expect(isAllowedPushEndpoint("https://web.push.apple.com/QGx", own)).toBe(true);
  });
  it("refuses http, credentials, ports, IPs, local names and this server", () => {
    expect(isAllowedPushEndpoint("http://fcm.googleapis.com/fcm/send/abc", own)).toBe(false);
    expect(isAllowedPushEndpoint("https://user:pw@fcm.googleapis.com/x", own)).toBe(false);
    expect(isAllowedPushEndpoint("https://fcm.googleapis.com:8443/x", own)).toBe(false);
    expect(isAllowedPushEndpoint("https://169.254.169.254/latest", own)).toBe(false);
    expect(isAllowedPushEndpoint("https://[::1]/x", own)).toBe(false);
    expect(isAllowedPushEndpoint("https://localhost/x", own)).toBe(false);
    expect(isAllowedPushEndpoint("https://printer.local/x", own)).toBe(false);
    expect(isAllowedPushEndpoint("https://metadata/x", own)).toBe(false);
    expect(isAllowedPushEndpoint(`https://${own}/api/agent/team`, own)).toBe(false);
    expect(isAllowedPushEndpoint(`https://fcm.googleapis.com/${"a".repeat(1100)}`, own)).toBe(false);
  });
});

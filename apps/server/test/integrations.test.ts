import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "yunidesk/webhooks";
import { generateApiKey, isWellFormedApiKey, requiredScope } from "../src/lib/api-keys";
import { openSecret, sealSecret } from "../src/lib/secret-box";
import { MAX_ATTEMPTS, decideAttempt, endpointWants, signatureHeader } from "../src/lib/webhooks";

const MASTER = "session-secret-for-tests-0123456789abcdef";
const HOUR = 3600_000;

describe("API key format", () => {
  it("accepts generated keys and rejects any edited character", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^ydk_[0-9a-z]{39}$/);
    expect(isWellFormedApiKey(key)).toBe(true);
    const at = 10;
    const swapped = key.slice(0, at) + (key[at] === "a" ? "b" : "a") + key.slice(at + 1);
    expect(isWellFormedApiKey(swapped)).toBe(false);
    expect(isWellFormedApiKey(key.slice(0, -1))).toBe(false);
    expect(isWellFormedApiKey(key.replace("ydk_", "ydx_"))).toBe(false);
  });
});

describe("what an API key may call", () => {
  const id = "cnv_01j9zz0000abcdefghjkmnpqrs";

  it("maps allowed routes to their scope", () => {
    expect(requiredScope("GET", "/conversations")).toBe("conversations:read");
    expect(requiredScope("GET", `/conversations/${id}/messages`)).toBe("conversations:read");
    expect(requiredScope("POST", `/conversations/${id}/messages`)).toBe("conversations:write");
    expect(requiredScope("PATCH", `/conversations/${id}`)).toBe("conversations:write");
    expect(requiredScope("GET", "/contacts")).toBe("contacts:read");
    expect(requiredScope("GET", "/key")).toBeNull();
  });

  it("refuses everything else, including owner-only and GDPR routes", () => {
    for (const [method, path] of [
      ["GET", "/bootstrap"],
      ["GET", "/ws"],
      ["GET", "/team"],
      ["POST", "/team/invites"],
      ["PUT", "/settings"],
      ["GET", "/api-keys"],
      ["POST", "/api-keys"],
      ["GET", `/contacts/${id}/export`],
      ["DELETE", `/contacts/${id}`],
      ["POST", `/conversations/${id}/read`],
      ["PATCH", "/me"],
      ["DELETE", `/conversations/${id}`],
      ["GET", `/conversations/${id}/messages/extra`],
      ["GET", "/conversations/../team"],
    ] as const) {
      expect(requiredScope(method, path), `${method} ${path}`).toBeUndefined();
    }
  });
});

describe("sealed secrets", () => {
  it("round-trips, and fails for another row, another purpose or another master secret", async () => {
    const sealed = await sealSecret(MASTER, "webhook", "whe_1", "whsec_abc");
    expect(await openSecret(MASTER, "webhook", "whe_1", sealed)).toBe("whsec_abc");
    await expect(openSecret(MASTER, "webhook", "whe_2", sealed)).rejects.toThrow();
    await expect(openSecret(MASTER, "other", "whe_1", sealed)).rejects.toThrow();
    await expect(openSecret(`${MASTER}x`, "webhook", "whe_1", sealed)).rejects.toThrow();
  });
});

describe("webhook deliveries", () => {
  const now = Date.UTC(2026, 9, 10, 12);

  it("retries with growing delays, then gives up", () => {
    const first = decideAttempt(1, { ok: false, status: 500, error: "HTTP 500" }, null, now);
    const second = decideAttempt(2, { ok: false, status: 500, error: "HTTP 500" }, now, now);
    expect(first).toEqual({ delivery: "retry", nextAttemptAt: now + 60_000, disableEndpoint: null });
    expect(second.delivery === "retry" && second.nextAttemptAt).toBe(now + 5 * 60_000);
    expect(decideAttempt(MAX_ATTEMPTS, { ok: false, status: 500, error: "HTTP 500" }, now, now)).toEqual({
      delivery: "failed",
      disableEndpoint: null,
    });
    expect(decideAttempt(3, { ok: true, status: 204 }, now - 100 * HOUR, now)).toEqual({ delivery: "succeeded" });
  });

  it("disables an endpoint that answers 410 or has failed for 3 days", () => {
    expect(decideAttempt(1, { ok: false, status: 410, error: "HTTP 410" }, null, now)).toMatchObject({
      delivery: "failed",
      disableEndpoint: expect.any(String),
    });
    expect(decideAttempt(2, { ok: false, status: 503, error: "HTTP 503" }, now - 72 * HOUR, now)).toMatchObject({
      delivery: "failed",
      disableEndpoint: expect.any(String),
    });
    expect(decideAttempt(2, { ok: false, status: 503, error: "HTTP 503" }, now - 71 * HOUR, now).delivery).toBe("retry");
  });

  it("sends only the events an endpoint subscribed to", () => {
    expect(endpointWants(["message.created"], "message.created")).toBe(true);
    expect(endpointWants(["message.created"], "conversation.created")).toBe(false);
    expect(endpointWants(["*"], "conversation.rated")).toBe(true);
  });

  it("signs with every active secret, so receivers on the old or the new secret both verify", async () => {
    const body = '{"id":"evt_1","event":"ping","createdAt":1,"data":{}}';
    const header = await signatureHeader(["whsec_new", "whsec_old"], now, body);
    expect(await verifyWebhookSignature("whsec_new", header, body, { now })).toBe(true);
    expect(await verifyWebhookSignature("whsec_old", header, body, { now })).toBe(true);
    expect(await verifyWebhookSignature("whsec_other", header, body, { now })).toBe(false);
  });
});

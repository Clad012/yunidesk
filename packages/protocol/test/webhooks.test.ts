import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "../src/webhooks";

const SECRET = "whsec_test";
const NOW = 1_800_000_000_000;

async function sign(body: string, t: number, secret = SECRET): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`${t}.${body}`)));
  return `t=${t},v1=${Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify({ event: "message.created", data: { id: 1 } });

  it("accepts a fresh, untouched call", async () => {
    expect(await verifyWebhookSignature(SECRET, await sign(body, NOW), body, { now: NOW + 1000 })).toBe(true);
  });

  it("rejects a changed body, another secret, and replays older than the tolerance", async () => {
    const header = await sign(body, NOW);
    expect(await verifyWebhookSignature(SECRET, header, body.replace("1", "2"), { now: NOW })).toBe(false);
    expect(await verifyWebhookSignature(SECRET, await sign(body, NOW, "other"), body, { now: NOW })).toBe(false);
    expect(await verifyWebhookSignature(SECRET, header, body, { now: NOW + 6 * 60 * 1000 })).toBe(false);
  });
});

describe("event catalogue", () => {
  it("describes exactly the events the server sends, each in English and French", async () => {
    const { WEBHOOK_EVENT_CATALOG, WEBHOOK_EVENT_NAMES } = await import("../src/webhooks");
    expect(WEBHOOK_EVENT_CATALOG.map((event) => event.name).sort()).toEqual([...WEBHOOK_EVENT_NAMES].sort());
    for (const event of WEBHOOK_EVENT_CATALOG) {
      expect(event.title.en && event.title.fr && event.description.en && event.description.fr).toBeTruthy();
      expect(event.fields.some((field) => field.path === "conversationId")).toBe(true);
    }
  });
});

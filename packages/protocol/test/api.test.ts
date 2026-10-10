import { describe, expect, it } from "vitest";
import { YunideskApiError, createYunideskApi, normalizeBaseUrl } from "../src/api";
import { verifyWebhookSignature } from "../src/webhooks";

describe("API client base URL", () => {
  it("only sends keys over https, except to localhost", () => {
    expect(normalizeBaseUrl("https://support.example.com/")).toBe("https://support.example.com");
    expect(normalizeBaseUrl("http://localhost:8787")).toBe("http://localhost:8787");
    expect(() => normalizeBaseUrl("http://support.example.com")).toThrow();
    expect(() => normalizeBaseUrl("https://user:pw@support.example.com")).toThrow();
    expect(() => normalizeBaseUrl("https://support.example.com/?x=1")).toThrow();
  });
});

describe("API client calls", () => {
  it("turns error bodies into YunideskApiError and adds a clientId to sends", async () => {
    const seen: { url: string; body: unknown; auth: string | null }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen.push({ url, body: init.body ? JSON.parse(String(init.body)) : null, auth: new Headers(init.headers).get("authorization") });
      if (url.endsWith("/team")) return new Response("", { status: 404 });
      if (url.includes("/messages")) return Response.json({ conversation: {}, message: {} }, { status: 201 });
      return Response.json({ error: { code: "forbidden", message: "This API key needs the contacts:read scope" } }, { status: 403 });
    }) as unknown as typeof fetch;
    const api = createYunideskApi({ baseUrl: "https://support.example.com", apiKey: "ydk_test", fetch: fakeFetch });

    const error = await api.contacts.list().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(YunideskApiError);
    expect((error as YunideskApiError).status).toBe(403);
    expect((error as YunideskApiError).code).toBe("forbidden");

    await api.conversations.send("cnv_1", { body: "Hi", kind: "text" });
    const send = seen.at(-1)!;
    expect(send.url).toBe("https://support.example.com/api/agent/conversations/cnv_1/messages");
    expect(send.auth).toBe("Bearer ydk_test");
    expect((send.body as { clientId: string }).clientId).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("webhook signature during a secret roll", () => {
  it("accepts a header carrying the old and the new signature", async () => {
    const body = "{}";
    const t = 1_000_000;
    const sign = async (secret: string) => {
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${t}.${body}`)));
      return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
    };
    const header = `t=${t},v1=${await sign("new")},v1=${await sign("old")}`;
    expect(await verifyWebhookSignature("old", header, body, { now: t })).toBe(true);
    expect(await verifyWebhookSignature("new", header, body, { now: t })).toBe(true);
    expect(await verifyWebhookSignature("x", header, body, { now: t })).toBe(false);
  });
});

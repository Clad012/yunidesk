import { afterEach, describe, expect, it, vi } from "vitest";
import { SupportClient, type KeyValueStorage } from "../src/client";

// fetch is the network: faked. The session logic under test is real.
afterEach(() => vi.unstubAllGlobals());

describe("SupportClient logout during a slow session request", () => {
  it("does not bring back the previous user's session or store their visitor token", async () => {
    let answer!: (r: Response) => void;
    const firstSession = new Promise<Response>((resolve) => (answer = resolve));
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/api/v1/session") && fetchMock.mock.calls.length === 1) return firstSession;
      if (url.endsWith("/api/v1/session")) {
        return Promise.resolve(Response.json({ token: "visitor-session", expiresAt: Date.now() + 3600e3, contact: { id: "ctc_visitor", name: null, email: null, isIdentified: false }, visitorToken: "v2" }));
      }
      return Promise.resolve(Response.json({ seen: (init?.headers as Record<string, string>).authorization }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const stored = new Map<string, string>();
    const storage: KeyValueStorage = { get: (k) => stored.get(k) ?? null, set: (k, v) => void stored.set(k, v), remove: (k) => void stored.delete(k) };
    const client = new SupportClient({ baseUrl: "https://s.test", channel: "ios", storage, getUserToken: async () => "user-a-token" });

    const pending = client.listConversations().catch((e: Error) => e);
    await Promise.resolve();
    await client.reset(); // user A logs out while A's session request is still in flight
    await client.setUserTokenProvider(undefined);
    answer(Response.json({ token: "session-of-A", expiresAt: Date.now() + 3600e3, contact: { id: "ctc_A", name: "A", email: null, isIdentified: true }, visitorToken: "vA" }));
    await pending;

    expect(client.contact).toBeNull();
    expect(stored.get("yunidesk:visitor")).toBeUndefined();
    const result = (await client.listConversations()) as unknown as { seen: string };
    expect(result.seen).toBe("Bearer visitor-session");
  });
});

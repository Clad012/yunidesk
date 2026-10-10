import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PONG_TIMEOUT_MS, SupportClient } from "../src/client";

// The network (fetch, WebSocket) is faked; the heartbeat and reconnect logic under test is real.
class FakeSocket {
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  closedWith: number | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.all.push(this);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  send(data: string) {
    this.sent.push(data);
  }
  close(code: number) {
    this.closedWith = code;
    this.readyState = 3;
  }
  receive(frame: object) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }
}

const session = { token: "t", expiresAt: Date.now() + 24 * 3600e3, contact: { id: "c", name: null, email: null, isIdentified: false }, visitorToken: null };

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.all = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("fetch", (url: string) =>
    Promise.resolve(Response.json(url.endsWith("/session") ? session : { ticket: "tk" })),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function connectedClient() {
  const client = new SupportClient({ baseUrl: "https://s.test", channel: "web" });
  const states: string[] = [];
  client.on("connection", (s) => states.push(s));
  client.connect();
  await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(1));
  FakeSocket.all[0]!.open();
  return { client, states, first: FakeSocket.all[0]! };
}

describe("heartbeat", () => {
  it("drops a socket that stops answering pings and reconnects", async () => {
    const { states, first } = await connectedClient();
    await vi.advanceTimersByTimeAsync(25_000); // ping goes out
    expect(first.sent).toContain('{"type":"ping"}');
    await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS + 1); // nothing comes back
    expect(first.closedWith).toBe(4000);
    expect(states.at(-1)).toBe("reconnecting");
    await vi.advanceTimersByTimeAsync(2_000); // first back-off step
    expect(FakeSocket.all).toHaveLength(2);
  });

  it("keeps a socket that answers", async () => {
    const { first } = await connectedClient();
    await vi.advanceTimersByTimeAsync(25_000);
    first.receive({ type: "pong" });
    await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS + 1);
    expect(first.closedWith).toBeNull();
    expect(FakeSocket.all).toHaveLength(1);
  });

  it("retryNow skips the back-off wait", async () => {
    const { client, first } = await connectedClient();
    first.onclose?.(); // network drop
    expect(FakeSocket.all).toHaveLength(1);
    client.retryNow();
    await vi.waitFor(() => expect(FakeSocket.all).toHaveLength(2));
  });
});

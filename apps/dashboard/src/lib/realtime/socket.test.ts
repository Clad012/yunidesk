import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PONG_TIMEOUT_MS, RealtimeSocket } from "./socket";

// The browser socket is faked; the heartbeat logic under test is real.
class FakeSocket {
  static OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  closedWith: number | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((m: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
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
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.all = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal("location", { protocol: "https:", host: "support.test", assign: vi.fn() });
  vi.stubGlobal("window", { addEventListener: vi.fn(), removeEventListener: vi.fn(), location: { assign: vi.fn() } });
  vi.stubGlobal("document", { addEventListener: vi.fn(), removeEventListener: vi.fn(), visibilityState: "visible" });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("dashboard socket heartbeat", () => {
  it("drops a silent socket and reconnects; keeps one that answers", async () => {
    const socket = new RealtimeSocket();
    socket.start();
    FakeSocket.all[0]!.open();

    await vi.advanceTimersByTimeAsync(25_000);
    FakeSocket.all[0]!.onmessage?.({ data: '{"type":"pong"}' });
    await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS + 1);
    expect(FakeSocket.all[0]!.closedWith).toBeNull();

    await vi.advanceTimersByTimeAsync(25_000 - PONG_TIMEOUT_MS - 1); // next ping, no answer this time
    await vi.advanceTimersByTimeAsync(PONG_TIMEOUT_MS + 1);
    expect(FakeSocket.all[0]!.closedWith).toBe(4000);
    expect(socket.status).toBe("closed");
    await vi.advanceTimersByTimeAsync(30_000);
    expect(FakeSocket.all.length).toBe(2);
    socket.stop();
  });

  it("stops retrying when the server signs the session out", async () => {
    const socket = new RealtimeSocket();
    socket.start();
    FakeSocket.all[0]!.open();
    FakeSocket.all[0]!.onclose?.({ code: 4401 });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(FakeSocket.all.length).toBe(1);
    expect(window.location.assign).toHaveBeenCalledWith("/login");
  });
});

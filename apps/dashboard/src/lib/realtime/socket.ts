import type { AgentServerEvent, ClientEvent } from "yunidesk";
import { backoffDelay } from "./backoff";
import { Emitter } from "./emitter";

export type SocketStatus = "connecting" | "open" | "closed";

type Events = {
  event: AgentServerEvent;
  status: SocketStatus;
  /** Fired after a reconnect (not the first connect) so caches can refetch. */
  reconnected: undefined;
};

const PING_MS = 25_000;
/** No frame within this long after a ping: the socket is dead even if it still looks open. */
export const PONG_TIMEOUT_MS = 10_000;
/** The server closes with this code when the session ends (logout, disabled, password changed). */
const SIGNED_OUT = 4401;

/** The team websocket: cookie auth, ping every 25 s, reconnect with backoff + jitter. */
export class RealtimeSocket {
  readonly emitter = new Emitter<Events>();
  status: SocketStatus = "closed";
  private ws: WebSocket | null = null;
  private attempt = 0;
  private everOpened = false;
  private stopped = true;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private lastFrameAt = 0;

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    window.addEventListener("online", this.retryNow);
    document.addEventListener("visibilitychange", this.onVisible);
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    window.removeEventListener("online", this.retryNow);
    document.removeEventListener("visibilitychange", this.onVisible);
    this.clearTimers();
    this.ws?.close(1000);
    this.ws = null;
    this.everOpened = false;
    this.setStatus("closed");
  }

  send(event: ClientEvent): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(event));
  }

  private retryNow = () => {
    if (this.stopped) return;
    if (this.status === "open") {
      this.heartbeat(); // looks open: make sure it really is
    } else if (this.status === "closed") {
      this.clearTimers();
      this.connect();
    }
  };

  private onVisible = () => {
    if (document.visibilityState === "visible") this.retryNow();
  };

  private heartbeat(): void {
    const sentAt = Date.now();
    this.send({ type: "ping" });
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pongTimer = setTimeout(() => {
      this.pongTimer = null;
      if (this.lastFrameAt < sentAt) this.dropDeadSocket();
    }, PONG_TIMEOUT_MS);
  }

  /** Network switch, sleep, proxy: the socket stopped answering. Forget it and reconnect. */
  private dropDeadSocket(): void {
    const ws = this.ws;
    if (!ws) return;
    this.ws = null;
    ws.onopen = ws.onmessage = ws.onclose = null;
    try {
      ws.close(4000, "No heartbeat");
    } catch {
      // already gone
    }
    this.clearTimers();
    this.setStatus("closed");
    if (!this.stopped) this.retryTimer = setTimeout(() => this.connect(), backoffDelay(this.attempt++));
  }

  private connect(): void {
    const protocol = location.protocol === "https:" ? "wss:" : "ws:";
    const ws = new WebSocket(`${protocol}//${location.host}/api/agent/ws`);
    this.ws = ws;
    this.setStatus("connecting");

    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.attempt = 0;
      this.setStatus("open");
      if (this.everOpened) this.emitter.emit("reconnected", undefined);
      this.everOpened = true;
      this.lastFrameAt = Date.now();
      this.pingTimer = setInterval(() => this.heartbeat(), PING_MS);
    };
    ws.onmessage = (message) => {
      if (this.ws !== ws || typeof message.data !== "string") return;
      this.lastFrameAt = Date.now();
      try {
        const event = JSON.parse(message.data) as AgentServerEvent | { type: "pong" };
        if (event.type !== "pong") this.emitter.emit("event", event);
      } catch {
        // ignore malformed frames
      }
    };
    ws.onclose = (event) => {
      if (this.ws !== ws) return;
      this.clearTimers();
      this.ws = null;
      this.setStatus("closed");
      if (event.code === SIGNED_OUT) {
        // The session is over; retrying would only fail. Go sign in again.
        this.stop();
        window.location.assign("/login");
        return;
      }
      if (!this.stopped) this.retryTimer = setTimeout(() => this.connect(), backoffDelay(this.attempt++));
    };
  }

  private clearTimers(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pingTimer = this.retryTimer = this.pongTimer = null;
  }

  private setStatus(status: SocketStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emitter.emit("status", status);
  }
}

export const realtime = new RealtimeSocket();

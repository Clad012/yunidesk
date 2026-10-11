import { TYPING_THROTTLE_MS } from "./limits";
import { isContactServerEvent } from "./events";
import type {
  ApiErrorBody,
  Attachment,
  BootstrapResponse,
  Channel,
  ClientEvent,
  ContactConversation,
  ContactProfile,
  ContactServerEvent,
  Message,
  Page,
  SendMessageInput,
  SessionResponse,
} from "./types";

// The contact-side client used by the web widget and the React Native SDK.
// Plain fetch, XMLHttpRequest and WebSocket, so it runs in browsers and React Native alike.

export interface KeyValueStorage {
  get(key: string): Promise<string | null> | string | null;
  set(key: string, value: string): Promise<void> | void;
  remove(key: string): Promise<void> | void;
}

export interface SupportClientOptions {
  /** Origin of the support worker, for example https://support.example.com */
  baseUrl: string;
  channel: Channel;
  /** Returns a token signed by your backend for the signed-in user, or null for a visitor. */
  getUserToken?: () => Promise<string | null>;
  /** Keeps an anonymous visitor's session across reloads. */
  storage?: KeyValueStorage;
}

/** A browser File/Blob, or a React Native file reference. */
export type UploadSource = Blob | { uri: string; name: string; type: string };

export type ConnectionState = "idle" | "connecting" | "open" | "reconnecting" | "closed";

interface ClientEvents {
  event: ContactServerEvent;
  connection: ConnectionState;
  /** The socket came back after a drop; refetch anything you show. */
  reconnected: void;
  session: ContactProfile;
}

type Listener<T> = (value: T) => void;

export class SupportApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SupportApiError";
  }
}

const VISITOR_KEY = "yunidesk:visitor";
const PING_INTERVAL_MS = 25_000;
/** No frame at all within this long after a ping: the connection is dead even if it looks open. */
export const PONG_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;

export class SupportClient {
  private readonly baseUrl: string;
  private session: SessionResponse | null = null;
  private sessionPromise: Promise<SessionResponse> | null = null;
  /** Bumped on logout / user switch; a session request started before that is thrown away. */
  private generation = 0;
  private stableTimer: ReturnType<typeof setTimeout> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private lastFrameAt = 0;
  private listening = false;
  private socket: WebSocket | null = null;
  private socketWanted = false;
  private everConnected = false;
  private attempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private lastTypingSent = new Map<string, number>();
  private listeners: { [K in keyof ClientEvents]: Set<Listener<ClientEvents[K]>> } = {
    event: new Set(),
    connection: new Set(),
    reconnected: new Set(),
    session: new Set(),
  };
  private state: ConnectionState = "idle";

  constructor(private options: SupportClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
  }

  get connectionState(): ConnectionState {
    return this.state;
  }

  get contact(): ContactProfile | null {
    return this.session?.contact ?? null;
  }

  on<K extends keyof ClientEvents>(name: K, listener: Listener<ClientEvents[K]>): () => void {
    this.listeners[name].add(listener);
    return () => this.listeners[name].delete(listener);
  }

  /** Switch user (login, logout). Drops the current session and socket. */
  async setUserTokenProvider(getUserToken: SupportClientOptions["getUserToken"]): Promise<void> {
    this.options = { ...this.options, getUserToken };
    const wasConnected = this.socketWanted;
    this.disconnect();
    this.generation += 1;
    this.session = null;
    this.sessionPromise = null;
    if (wasConnected) this.connect();
  }

  /** Forget everything stored for this device, for example on logout. */
  async reset(): Promise<void> {
    this.disconnect();
    this.generation += 1;
    this.session = null;
    this.sessionPromise = null;
    await this.options.storage?.remove(VISITOR_KEY);
  }

  // ---- REST ----

  bootstrap(): Promise<BootstrapResponse> {
    return this.request("GET", "/api/v1/bootstrap");
  }

  listConversations(): Promise<{ items: ContactConversation[] }> {
    return this.request("GET", "/api/v1/conversations");
  }

  getConversation(id: string): Promise<ContactConversation> {
    return this.request("GET", `/api/v1/conversations/${encodeURIComponent(id)}`);
  }

  createConversation(input: SendMessageInput): Promise<{ conversation: ContactConversation; message: Message }> {
    return this.request("POST", "/api/v1/conversations", input);
  }

  listMessages(conversationId: string, options: { before?: string } = {}): Promise<Page<Message>> {
    const query = options.before ? `?before=${encodeURIComponent(options.before)}` : "";
    return this.request("GET", `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages${query}`);
  }

  sendMessage(
    conversationId: string,
    input: SendMessageInput,
  ): Promise<{ conversation: ContactConversation; message: Message }> {
    return this.request("POST", `/api/v1/conversations/${encodeURIComponent(conversationId)}/messages`, input);
  }

  markRead(conversationId: string): Promise<{ at: number }> {
    return this.request("POST", `/api/v1/conversations/${encodeURIComponent(conversationId)}/read`);
  }

  /** "Talk to a human": the AI assistant stops and the team takes the conversation. */
  handoff(conversationId: string): Promise<ContactConversation> {
    return this.request("POST", `/api/v1/conversations/${encodeURIComponent(conversationId)}/handoff`);
  }

  rate(conversationId: string, input: { score: 1 | 2 | 3; comment?: string }): Promise<ContactConversation> {
    return this.request("POST", `/api/v1/conversations/${encodeURIComponent(conversationId)}/rating`, input);
  }

  /** Only for anonymous visitors; identified users' details come from the signed token. */
  async updateContact(input: { email?: string; name?: string }): Promise<ContactProfile> {
    const contact = await this.request<ContactProfile>("PATCH", "/api/v1/contact", input);
    if (this.session) this.session = { ...this.session, contact };
    this.emit("session", contact);
    return contact;
  }

  async uploadAttachment(
    source: UploadSource,
    options: {
      fileName?: string;
      /** Image size in pixels, so messages can reserve space before the image loads. */
      width?: number;
      height?: number;
      onProgress?: (fraction: number) => void;
      signal?: AbortSignal;
    } = {},
  ): Promise<Attachment> {
    const session = await this.ensureSession();
    const form = new FormData();
    if (isNativeFile(source)) {
      // React Native's FormData accepts { uri, name, type } objects.
      form.append("file", source as unknown as Blob, source.name);
    } else {
      const name = options.fileName ?? (source as File).name ?? "file";
      form.append("file", source, name);
    }
    if (options.width && options.height) {
      form.append("width", String(Math.round(options.width)));
      form.append("height", String(Math.round(options.height)));
    }
    return uploadWithProgress<Attachment>(
      `${this.baseUrl}/api/v1/attachments`,
      form,
      session.token,
      options.onProgress,
      options.signal,
    );
  }

  // ---- Realtime ----

  connect(): void {
    this.socketWanted = true;
    this.listenForNetwork();
    if (this.socket || this.reconnectTimer) return;
    void this.openSocket();
  }

  /**
   * Reconnect now instead of waiting for the back-off (network back, app or tab visible again).
   * With a socket that looks open, it sends a ping: a dead one is dropped within PONG_TIMEOUT_MS.
   */
  retryNow(): void {
    if (!this.socketWanted) return;
    if (this.socket) {
      if (this.socket.readyState === 1) this.heartbeat();
      return;
    }
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    void this.openSocket();
  }

  disconnect(): void {
    this.socketWanted = false;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onclose = null;
      socket.close(1000);
    }
    this.everConnected = false;
    this.setState("closed");
  }

  /** Stop the socket while the app is in the background, keeping the session. */
  pause(): void {
    if (!this.socketWanted) return;
    this.disconnect();
    this.socketWanted = true;
  }

  resume(): void {
    if (!this.socketWanted || this.socket) return;
    this.everConnected = true; // a resume counts as a reconnect so screens refetch
    void this.openSocket();
  }

  sendTyping(conversationId: string, isTyping: boolean): void {
    const now = Date.now();
    if (isTyping) {
      const last = this.lastTypingSent.get(conversationId) ?? 0;
      if (now - last < TYPING_THROTTLE_MS) return;
      this.lastTypingSent.set(conversationId, now);
    } else {
      this.lastTypingSent.delete(conversationId);
    }
    this.send({ type: "typing", conversationId, isTyping });
  }

  // ---- internals ----

  private send(event: ClientEvent): void {
    if (this.socket && this.socket.readyState === 1) this.socket.send(JSON.stringify(event));
  }

  private async openSocket(): Promise<void> {
    this.setState(this.everConnected ? "reconnecting" : "connecting");
    let ticket: string;
    try {
      ({ ticket } = await this.request<{ ticket: string }>("POST", "/api/v1/ws-ticket"));
    } catch {
      this.scheduleReconnect();
      return;
    }
    if (!this.socketWanted) return;

    const url = `${this.baseUrl.replace(/^http/, "ws")}/api/v1/ws?ticket=${encodeURIComponent(ticket)}`;
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      const isReconnect = this.everConnected;
      // Back-off only resets once the socket has stayed up a while (a server that accepts then
      // drops would otherwise get a reconnect every second from every client).
      this.stableTimer = setTimeout(() => {
        this.attempts = 0;
      }, 10_000);
      this.everConnected = true;
      this.lastFrameAt = Date.now();
      this.setState("open");
      this.pingTimer = setInterval(() => this.heartbeat(), PING_INTERVAL_MS);
      if (isReconnect) this.emit("reconnected", undefined);
    };
    socket.onmessage = (message) => {
      if (this.socket !== socket || typeof message.data !== "string") return;
      this.lastFrameAt = Date.now(); // any frame, including "pong", proves the connection is alive
      let parsed: unknown;
      try {
        parsed = JSON.parse(message.data);
      } catch {
        return; // ignore malformed frames
      }
      if (isContactServerEvent(parsed)) this.emit("event", parsed);
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearTimers();
      if (this.socketWanted) this.scheduleReconnect();
      else this.setState("closed");
    };
    socket.onerror = () => {
      // onclose follows and handles the retry
    };
  }

  private heartbeat(): void {
    const sentAt = Date.now();
    this.send({ type: "ping" });
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.pongTimer = setTimeout(() => {
      this.pongTimer = null;
      if (this.lastFrameAt < sentAt) this.dropDeadSocket();
    }, PONG_TIMEOUT_MS);
  }

  /** The socket stopped answering (network switch, sleep, proxy): forget it and reconnect. */
  private dropDeadSocket(): void {
    const socket = this.socket;
    if (!socket) return;
    this.socket = null;
    socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
    try {
      socket.close(4000, "No heartbeat");
    } catch {
      // already gone
    }
    this.clearTimers();
    if (this.socketWanted) this.scheduleReconnect();
  }

  /** Browsers only: retry at once when the network comes back or the page becomes visible. */
  private listenForNetwork(): void {
    if (this.listening) return;
    type Listenable = { addEventListener?: (type: string, listener: () => void) => void };
    const target = globalThis as Listenable & { document?: Listenable & { visibilityState?: string } };
    if (typeof target.addEventListener !== "function") return; // React Native: the SDK uses AppState
    this.listening = true;
    target.addEventListener("online", () => this.retryNow());
    target.document?.addEventListener?.("visibilitychange", () => {
      if (target.document?.visibilityState === "visible") this.retryNow();
    });
  }

  private scheduleReconnect(): void {
    if (!this.socketWanted || this.reconnectTimer) return;
    this.setState("reconnecting");
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempts) * (0.7 + Math.random() * 0.6);
    this.attempts += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.socketWanted) void this.openSocket();
    }, delay);
  }

  private clearTimers(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.stableTimer) clearTimeout(this.stableTimer);
    if (this.pongTimer) clearTimeout(this.pongTimer);
    this.stableTimer = null;
    this.pongTimer = null;
    this.reconnectTimer = null;
    this.pingTimer = null;
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit("connection", state);
  }

  private emit<K extends keyof ClientEvents>(name: K, value: ClientEvents[K]): void {
    for (const listener of this.listeners[name]) listener(value);
  }

  private async ensureSession(): Promise<SessionResponse> {
    if (this.session && this.session.expiresAt - 60_000 > Date.now()) return this.session;
    if (!this.sessionPromise) {
      const promise: Promise<SessionResponse> = this.createSession(this.generation).finally(() => {
        if (this.sessionPromise === promise) this.sessionPromise = null;
      });
      this.sessionPromise = promise;
    }
    return this.sessionPromise;
  }

  private async createSession(generation: number): Promise<SessionResponse> {
    const userToken = (await this.options.getUserToken?.()) ?? null;
    const visitorToken = userToken ? null : ((await this.options.storage?.get(VISITOR_KEY)) ?? null);
    const response = await fetch(`${this.baseUrl}/api/v1/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userToken, visitorToken, channel: this.options.channel }),
    });
    const session = await readJson<SessionResponse>(response);
    // The user logged out or switched while this was in flight: don't resurrect their session.
    if (generation !== this.generation) throw new SupportApiError(0, "session_changed", "The session changed");
    if (session.visitorToken) await this.options.storage?.set(VISITOR_KEY, session.visitorToken);
    this.session = session;
    this.emit("session", session.contact);
    return session;
  }

  private async request<T>(method: string, path: string, body?: unknown, retried = false): Promise<T> {
    const session = await this.ensureSession();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${session.token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (response.status === 401 && !retried) {
      this.session = null;
      return this.request(method, path, body, true);
    }
    return readJson<T>(response);
  }
}

function isNativeFile(source: UploadSource): source is { uri: string; name: string; type: string } {
  return typeof (source as { uri?: unknown }).uri === "string";
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const error = (data as ApiErrorBody | null)?.error;
    throw new SupportApiError(response.status, error?.code ?? "http_error", error?.message ?? response.statusText);
  }
  return data as T;
}

function uploadWithProgress<T>(
  url: string,
  form: FormData,
  token: string,
  onProgress?: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.setRequestHeader("authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      let data: unknown = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        // fall through to the status check
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as T);
      else {
        const error = (data as ApiErrorBody | null)?.error;
        reject(new SupportApiError(xhr.status, error?.code ?? "upload_failed", error?.message ?? "Upload failed"));
      }
    };
    xhr.onerror = () => reject(new SupportApiError(0, "network_error", "Network error"));
    xhr.onabort = () => reject(new SupportApiError(0, "aborted", "Upload cancelled"));
    signal?.addEventListener("abort", () => xhr.abort());
    xhr.send(form);
  });
}

// Typed client for the team API with an API key (server to server). Never use a key in a browser
// or a mobile app: anyone could read it there.
import type {
  AgentConversation,
  AgentSendMessageInput,
  ApiKey,
  Contact,
  Message,
  Page,
  PublicAgent,
  WebhookDelivery,
  WebhookEndpoint,
  WebhookEndpointWithSecret,
} from "./types";
import type { WebhookEventName } from "./webhooks";

export interface YunideskApiOptions {
  /** Your Yunidesk address, e.g. https://support.example.com */
  baseUrl: string;
  /** `ydk_…`, from Settings → API keys. */
  apiKey: string;
  fetch?: typeof fetch;
  /** Per request; default 15 s. */
  timeoutMs?: number;
}

export class YunideskApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "YunideskApiError";
  }
}

export type ConversationView = "mine" | "unassigned" | "open" | "snoozed" | "resolved" | "all";

export interface ConversationPatch {
  status?: "open" | "snoozed" | "resolved";
  /** Epoch ms; with status "snoozed". */
  snoozedUntil?: number | null;
  /** A teammate id from `teammates()`, or null to unassign. */
  assigneeId?: string | null;
}

export interface WebhookEndpointInput {
  url: string;
  description?: string | null;
  events: (Exclude<WebhookEventName, "ping"> | "*")[];
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Keys only travel over https (plain http is accepted for localhost during development). */
export function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname))) {
    throw new Error("Yunidesk baseUrl must use https");
  }
  if (url.username || url.password || url.search || url.hash) throw new Error("Yunidesk baseUrl must be a plain origin");
  return url.origin;
}

function query(params: Record<string, string | undefined>): string {
  const entries = Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]));
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : "";
}

export function createYunideskApi(options: YunideskApiOptions) {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await doFetch(`${baseUrl}/api/agent${path}`, {
      method,
      headers: {
        authorization: `Bearer ${options.apiKey}`,
        accept: "application/json",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!response.ok) {
      const error = (json as { error?: { code?: string; message?: string } } | null)?.error;
      throw new YunideskApiError(response.status, error?.code ?? "http_error", error?.message ?? `HTTP ${response.status}`);
    }
    return json as T;
  }

  const id = (value: string) => encodeURIComponent(value);

  return {
    /** The key itself, its bot and the workspace name. Use it to check a key when connecting. */
    key: () => call<{ apiKey: ApiKey; workspace: { name: string } }>("GET", "/key"),
    teammates: () => call<{ items: PublicAgent[] }>("GET", "/teammates"),

    conversations: {
      list: (params: { view?: ConversationView; q?: string; cursor?: string; contactId?: string } = {}) =>
        call<Page<AgentConversation>>("GET", `/conversations${query(params)}`),
      get: (conversationId: string) => call<AgentConversation>("GET", `/conversations/${id(conversationId)}`),
      /** Oldest to newest; `nextCursor` points at an older page. Includes notes and events. */
      messages: (conversationId: string, params: { before?: string } = {}) =>
        call<Page<Message>>("GET", `/conversations/${id(conversationId)}/messages${query(params)}`),
      /** `kind: "note"` stays internal; "text" is sent to the customer. `clientId` makes retries safe. */
      send: (conversationId: string, input: Omit<AgentSendMessageInput, "clientId"> & { clientId?: string }) =>
        call<{ conversation: AgentConversation; message: Message }>("POST", `/conversations/${id(conversationId)}/messages`, {
          ...input,
          clientId: input.clientId ?? crypto.randomUUID(),
        }),
      update: (conversationId: string, patch: ConversationPatch) =>
        call<AgentConversation>("PATCH", `/conversations/${id(conversationId)}`, patch),
    },

    contacts: {
      list: (params: { q?: string; cursor?: string } = {}) => call<Page<Contact>>("GET", `/contacts${query(params)}`),
      get: (contactId: string) =>
        call<{ contact: Contact; conversations: AgentConversation[] }>("GET", `/contacts/${id(contactId)}`),
    },

    /** Endpoints created with this key. Revoking the key disables them. */
    webhookEndpoints: {
      list: () => call<{ items: WebhookEndpoint[] }>("GET", "/webhook-endpoints"),
      create: (input: WebhookEndpointInput) => call<WebhookEndpointWithSecret>("POST", "/webhook-endpoints", input),
      get: (endpointId: string) => call<WebhookEndpoint>("GET", `/webhook-endpoints/${id(endpointId)}`),
      update: (endpointId: string, patch: Partial<WebhookEndpointInput> & { enabled?: boolean }) =>
        call<WebhookEndpoint>("PATCH", `/webhook-endpoints/${id(endpointId)}`, patch),
      remove: (endpointId: string) => call<{ ok: true }>("DELETE", `/webhook-endpoints/${id(endpointId)}`),
      rollSecret: (endpointId: string, expireCurrentInHours = 24) =>
        call<WebhookEndpointWithSecret>("POST", `/webhook-endpoints/${id(endpointId)}/roll-secret`, { expireCurrentInHours }),
      test: (endpointId: string) => call<WebhookDelivery>("POST", `/webhook-endpoints/${id(endpointId)}/test`),
      deliveries: (endpointId: string) =>
        call<{ items: WebhookDelivery[] }>("GET", `/webhook-endpoints/${id(endpointId)}/deliveries`),
    },
  };
}

export type YunideskApi = ReturnType<typeof createYunideskApi>;

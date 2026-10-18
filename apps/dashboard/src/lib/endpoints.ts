import type {
  AdminSettings,
  Agent,
  AgentConversation,
  AgentRole,
  AgentSendMessageInput,
  ApiKey,
  ApiScope,
  AssistantSettings,
  AssistantSettingsPatch,
  AssistantTool,
  AssistantToolInput,
  AssistantUsage,
  Attachment,
  AuditEntry,
  AuthStatus,
  CannedResponse,
  Contact,
  CreatedApiKey,
  ConversationField,
  ConversationFieldType,
  ConversationPriority,
  ConversationStatus,
  CustomFieldValue,
  EmailChannelPatch,
  EmailChannelSettings,
  EmailOriginal,
  EmailTestResult,
  InboxCounts,
  Invite,
  KnowledgeInput,
  KnowledgeItem,
  Message,
  Page,
  PublicAgent,
  ReportQuery,
  ReportSummary,
  ReportTagRow,
  ReportTeammateRow,
  ReportVolume,
  TagColor,
  TagWithUsage,
  PushPreferences,
  PushSettings,
  PushSubscriptionInput,
  SsoSettings,
  SsoSettingsPatch,
  WebhookDelivery,
  WebhookEndpoint,
  WebhookEndpointWithSecret,
} from "yunidesk";
import type { WebhookEventName } from "yunidesk/webhooks";
import { api, uploadWithProgress } from "./api";

export type InboxView = "mine" | "unassigned" | "open" | "snoozed" | "resolved" | "all";
export const INBOX_VIEWS: readonly InboxView[] = ["mine", "unassigned", "open", "snoozed", "resolved", "all"];

export interface Bootstrap {
  agent: Agent;
  teammates: PublicAgent[];
  settings: AdminSettings;
}

export type TeamMember = Agent & { disabled: boolean };

export interface ConversationPatch {
  status?: ConversationStatus;
  snoozedUntil?: number | null;
  assigneeId?: string | null;
  priority?: ConversationPriority;
  /** Merged into the stored values; null clears one. */
  customFields?: Record<string, CustomFieldValue | null>;
}

/** Narrow an inbox list (combinable with the view and the search). */
export interface ListFilters {
  tag?: string;
  priority?: ConversationPriority;
  /** Urgent first, then high, normal, low; newest first within each. */
  sort?: "priority";
}

export interface ConversationFieldInput {
  key: string;
  label: string;
  type: ConversationFieldType;
  options?: string[];
}

export interface CreateApiKeyInput {
  name: string;
  botName?: string;
  scopes: ApiScope[];
  expiresInDays: number | null;
}

/** "*" subscribes to every event, including ones added later. */
export type EndpointEvent = Exclude<WebhookEventName, "ping"> | "*";

export interface WebhookEndpointInput {
  url: string;
  description: string | null;
  events: EndpointEvent[];
}

export type WebhookEndpointPatch = Partial<WebhookEndpointInput> & { enabled?: boolean };

/** A test answer from the assistant: nothing is saved and no customer sees it. */
export interface AssistantPreview {
  reply: string;
  sources: { id: string; title: string }[];
  toolCalls: { name: string; ok: boolean }[];
}

export type AssistantToolPatch = Partial<AssistantToolInput>;

export const queryKeys = {
  bootstrap: ["bootstrap"] as const,
  counts: ["counts"] as const,
  conversationLists: ["conversations"] as const,
  conversationList: (view: InboxView, q: string, contactId?: string, filters: ListFilters = {}) =>
    ["conversations", view, q, contactId ?? "", filters] as const,
  conversation: (id: string) => ["conversation", id] as const,
  messages: (id: string) => ["messages", id] as const,
  contacts: (q: string) => ["contacts", q] as const,
  contact: (id: string) => ["contact", id] as const,
  team: ["team"] as const,
  settings: ["settings"] as const,
  canned: ["canned"] as const,
  apiKeys: ["api-keys"] as const,
  webhookEndpoints: ["webhook-endpoints"] as const,
  webhookDeliveries: (endpointId: string) => ["webhook-deliveries", endpointId] as const,
  assistant: ["assistant"] as const,
  assistantUsage: ["assistant", "usage"] as const,
  knowledgeLists: ["assistant", "knowledge"] as const,
  knowledge: (q: string) => ["assistant", "knowledge", q] as const,
  assistantTools: ["assistant", "tools"] as const,
  tags: ["tags"] as const,
  conversationFields: ["conversation-fields"] as const,
  pushSettings: ["push", "settings"] as const,
  pushPublicKey: ["push", "public-key"] as const,
  emailChannel: ["email-channel"] as const,
  messageEmail: (messageId: string) => ["message-email", messageId] as const,
  auditLog: (action: string, actor: string) => ["audit-log", action, actor] as const,
  sso: ["sso"] as const,
  report: (kind: "summary" | "volume" | "teammates" | "tags", query: ReportQuery) => ["reports", kind, query] as const,
};

function reportSearch(query: ReportQuery, extra: Record<string, string> = {}): string {
  const search = new URLSearchParams({ from: query.from, to: query.to, ...extra });
  if (query.tz) search.set("tz", query.tz);
  if (query.channel) search.set("channel", query.channel);
  if (query.tagId) search.set("tagId", query.tagId);
  if (query.assigneeId) search.set("assigneeId", query.assigneeId);
  return search.toString();
}

/** Result of the SSO "Test connection" button. */
export interface SsoTestResult {
  ok: true;
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
}

function auditSearch(filters: { action?: string; actor?: string; cursor?: string | null }): string {
  const search = new URLSearchParams();
  if (filters.action) search.set("action", filters.action);
  if (filters.actor) search.set("actor", filters.actor);
  if (filters.cursor) search.set("cursor", filters.cursor);
  const text = search.toString();
  return text ? `?${text}` : "";
}

const enc = encodeURIComponent;

export const endpoints = {
  authStatus: () => api<AuthStatus>("/api/agent/auth/status"),
  /** A page to navigate to (not fetched): the provider's sign-in, then back to the dashboard. */
  ssoStartUrl: "/api/agent/auth/sso/start",
  setup: (body: { setupToken: string; name: string; email: string; password: string }) =>
    api<{ agent: Agent }>("/api/agent/auth/setup", { body }),
  login: (body: { email: string; password: string }) => api<{ agent: Agent }>("/api/agent/auth/login", { body }),
  logout: () => api<{ ok: true }>("/api/agent/auth/logout", { method: "POST" }),
  invite: (token: string) => api<{ email: string; role: AgentRole }>(`/api/agent/auth/invites/${enc(token)}`),
  acceptInvite: (token: string, body: { name: string; password: string }) =>
    api<{ agent: Agent }>(`/api/agent/auth/invites/${enc(token)}/accept`, { body }),

  bootstrap: () => api<Bootstrap>("/api/agent/bootstrap"),
  counts: () => api<InboxCounts>("/api/agent/conversations/counts"),
  conversations: (params: { view: InboxView; q?: string; cursor?: string | null; contactId?: string } & ListFilters) => {
    const search = new URLSearchParams({ view: params.view });
    if (params.q) search.set("q", params.q);
    if (params.cursor) search.set("cursor", params.cursor);
    if (params.contactId) search.set("contactId", params.contactId);
    if (params.tag) search.set("tag", params.tag);
    if (params.priority) search.set("priority", params.priority);
    if (params.sort) search.set("sort", params.sort);
    return api<Page<AgentConversation>>(`/api/agent/conversations?${search}`);
  },
  conversation: (id: string) => api<AgentConversation>(`/api/agent/conversations/${enc(id)}`),
  messages: (id: string, before?: string | null) =>
    api<Page<Message>>(`/api/agent/conversations/${enc(id)}/messages${before ? `?before=${enc(before)}` : ""}`),
  send: (id: string, body: AgentSendMessageInput) =>
    api<{ conversation: AgentConversation; message: Message }>(`/api/agent/conversations/${enc(id)}/messages`, {
      body: { ...body },
    }),
  patchConversation: (id: string, body: ConversationPatch) =>
    api<AgentConversation>(`/api/agent/conversations/${enc(id)}`, { method: "PATCH", body: { ...body } }),
  markRead: (id: string) => api<{ at: number }>(`/api/agent/conversations/${enc(id)}/read`, { method: "POST" }),
  upload: (form: FormData, onProgress: (fraction: number) => void, signal?: AbortSignal) =>
    uploadWithProgress<Attachment>("/api/agent/attachments", form, onProgress, signal),

  contacts: (q: string, cursor?: string | null) => {
    const search = new URLSearchParams();
    if (q) search.set("q", q);
    if (cursor) search.set("cursor", cursor);
    return api<Page<Contact>>(`/api/agent/contacts?${search}`);
  },
  contact: (id: string) => api<{ contact: Contact; conversations: AgentConversation[] }>(`/api/agent/contacts/${enc(id)}`),
  contactExportUrl: (id: string) => `/api/agent/contacts/${enc(id)}/export`,
  deleteContact: (id: string) => api<{ ok: true }>(`/api/agent/contacts/${enc(id)}`, { method: "DELETE" }),

  updateMe: (body: { name?: string; currentPassword?: string; newPassword?: string }) =>
    api<{ agent: Agent }>("/api/agent/me", { method: "PATCH", body }),
  uploadAvatar: (form: FormData) => api<{ agent: Agent }>("/api/agent/me/avatar", { body: form }),

  team: () => api<{ agents: TeamMember[]; invites: Invite[] }>("/api/agent/team"),
  createInvite: (body: { email: string; role: AgentRole }) => api<{ id: string; url: string }>("/api/agent/team/invites", { body }),
  revokeInvite: (id: string) => api<{ ok: true }>(`/api/agent/team/invites/${enc(id)}`, { method: "DELETE" }),
  patchMember: (id: string, body: { role?: AgentRole; disabled?: boolean }) =>
    api<TeamMember>(`/api/agent/team/${enc(id)}`, { method: "PATCH", body }),

  settings: () => api<AdminSettings>("/api/agent/settings"),
  saveSettings: (body: Partial<AdminSettings>) => api<AdminSettings>("/api/agent/settings", { method: "PUT", body }),
  webhookSecret: () => api<{ secret: string }>("/api/agent/settings/webhook-secret", { method: "POST" }),

  canned: () => api<{ items: CannedResponse[] }>("/api/agent/canned-responses"),
  createCanned: (body: { shortcut: string; title: string; body: string }) =>
    api<CannedResponse>("/api/agent/canned-responses", { body }),
  updateCanned: (id: string, body: { shortcut: string; title: string; body: string }) =>
    api<CannedResponse>(`/api/agent/canned-responses/${enc(id)}`, { method: "PUT", body }),
  deleteCanned: (id: string) => api<{ ok: true }>(`/api/agent/canned-responses/${enc(id)}`, { method: "DELETE" }),

  apiKeys: () => api<{ items: ApiKey[] }>("/api/agent/api-keys"),
  createApiKey: (body: CreateApiKeyInput) => api<CreatedApiKey>("/api/agent/api-keys", { body: { ...body } }),
  revokeApiKey: (id: string) => api<{ ok: true }>(`/api/agent/api-keys/${enc(id)}`, { method: "DELETE" }),

  webhookEndpoints: () => api<{ items: WebhookEndpoint[] }>("/api/agent/webhook-endpoints"),
  createWebhookEndpoint: (body: WebhookEndpointInput) =>
    api<WebhookEndpointWithSecret>("/api/agent/webhook-endpoints", { body: { ...body } }),
  patchWebhookEndpoint: (id: string, body: WebhookEndpointPatch) =>
    api<WebhookEndpoint>(`/api/agent/webhook-endpoints/${enc(id)}`, { method: "PATCH", body: { ...body } }),
  deleteWebhookEndpoint: (id: string) => api<{ ok: true }>(`/api/agent/webhook-endpoints/${enc(id)}`, { method: "DELETE" }),
  rollWebhookSecret: (id: string, expireCurrentInHours = 24) =>
    api<WebhookEndpointWithSecret>(`/api/agent/webhook-endpoints/${enc(id)}/roll-secret`, { body: { expireCurrentInHours } }),
  testWebhookEndpoint: (id: string) => api<WebhookDelivery | null>(`/api/agent/webhook-endpoints/${enc(id)}/test`, { method: "POST" }),
  webhookDeliveries: (id: string) => api<{ items: WebhookDelivery[] }>(`/api/agent/webhook-endpoints/${enc(id)}/deliveries`),

  assistant: () => api<AssistantSettings>("/api/agent/assistant"),
  patchAssistant: (body: AssistantSettingsPatch) => api<AssistantSettings>("/api/agent/assistant", { method: "PATCH", body: { ...body } }),
  setOpenRouterKey: (key: string) => api<AssistantSettings>("/api/agent/assistant/openrouter-key", { method: "PUT", body: { key } }),
  removeOpenRouterKey: () => api<AssistantSettings>("/api/agent/assistant/openrouter-key", { method: "DELETE" }),
  assistantUsage: () => api<AssistantUsage>("/api/agent/assistant/usage"),
  previewAssistant: (message: string) => api<AssistantPreview>("/api/agent/assistant/preview", { body: { message } }),

  knowledge: (q: string) => api<{ items: KnowledgeItem[] }>(`/api/agent/assistant/knowledge${q ? `?q=${enc(q)}` : ""}`),
  createKnowledge: (body: KnowledgeInput) => api<KnowledgeItem>("/api/agent/assistant/knowledge", { body: { ...body } }),
  patchKnowledge: (id: string, body: Partial<KnowledgeInput>) =>
    api<KnowledgeItem>(`/api/agent/assistant/knowledge/${enc(id)}`, { method: "PATCH", body: { ...body } }),
  deleteKnowledge: (id: string) => api<{ ok: true }>(`/api/agent/assistant/knowledge/${enc(id)}`, { method: "DELETE" }),

  assistantTools: () => api<{ items: AssistantTool[] }>("/api/agent/assistant/tools"),
  createAssistantTool: (body: AssistantToolInput) => api<AssistantTool>("/api/agent/assistant/tools", { body: { ...body } }),
  patchAssistantTool: (id: string, body: AssistantToolPatch) =>
    api<AssistantTool>(`/api/agent/assistant/tools/${enc(id)}`, { method: "PATCH", body: { ...body } }),
  deleteAssistantTool: (id: string) => api<{ ok: true }>(`/api/agent/assistant/tools/${enc(id)}`, { method: "DELETE" }),
  tags: () => api<{ items: TagWithUsage[] }>("/api/agent/tags"),
  createTag: (body: { name: string; color: TagColor }) => api<TagWithUsage>("/api/agent/tags", { body }),
  patchTag: (id: string, body: { name?: string; color?: TagColor }) =>
    api<TagWithUsage>(`/api/agent/tags/${enc(id)}`, { method: "PATCH", body }),
  deleteTag: (id: string) => api<{ ok: true }>(`/api/agent/tags/${enc(id)}`, { method: "DELETE" }),
  tagConversation: (id: string, tag: { tagId: string } | { name: string; color: TagColor }) =>
    api<AgentConversation>(`/api/agent/conversations/${enc(id)}/tags`, { body: { ...tag } }),
  untagConversation: (id: string, tagId: string) =>
    api<AgentConversation>(`/api/agent/conversations/${enc(id)}/tags/${enc(tagId)}`, { method: "DELETE" }),

  conversationFields: () => api<{ items: ConversationField[] }>("/api/agent/conversation-fields"),
  createConversationField: (body: ConversationFieldInput) =>
    api<ConversationField>("/api/agent/conversation-fields", { body: { ...body } }),
  patchConversationField: (id: string, body: { label?: string; options?: string[] }) =>
    api<ConversationField>(`/api/agent/conversation-fields/${enc(id)}`, { method: "PATCH", body }),
  deleteConversationField: (id: string) => api<{ ok: true }>(`/api/agent/conversation-fields/${enc(id)}`, { method: "DELETE" }),
  reorderConversationFields: (ids: string[]) =>
    api<{ items: ConversationField[] }>("/api/agent/conversation-fields/reorder", { body: { ids } }),

  reportSummary: (query: ReportQuery) => api<ReportSummary>(`/api/agent/reports/summary?${reportSearch(query)}`),
  reportVolume: (query: ReportQuery) => api<ReportVolume>(`/api/agent/reports/volume?${reportSearch(query)}`),
  reportTeammates: (query: ReportQuery) => api<{ items: ReportTeammateRow[] }>(`/api/agent/reports/teammates?${reportSearch(query)}`),
  reportTags: (query: ReportQuery) => api<{ items: ReportTagRow[] }>(`/api/agent/reports/tags?${reportSearch(query)}`),
  /** A same-origin link the browser downloads with the session cookie. */
  reportCsvUrl: (table: "teammates" | "tags", query: ReportQuery) => `/api/agent/reports/${table}?${reportSearch(query, { format: "csv" })}`,

  rollAssistantToolSecret: () => api<{ secret: string }>("/api/agent/assistant/tools/roll-secret", { method: "POST" }),

  pushPublicKey: () => api<{ publicKey: string }>("/api/agent/push/public-key"),
  pushSettings: () => api<PushSettings>("/api/agent/push/preferences"),
  savePushPreferences: (body: Partial<PushPreferences>) => api<PushSettings>("/api/agent/push/preferences", { method: "PUT", body: { ...body } }),
  pushSubscribe: (body: PushSubscriptionInput) => api<PushSettings>("/api/agent/push/subscriptions", { body: { ...body } }),
  pushUnsubscribe: (endpoint: string) => api<PushSettings>("/api/agent/push/subscriptions", { method: "DELETE", body: { endpoint } }),
  pushTest: (endpoint: string) =>
    api<{ outcome: "delivered" | "gone" | "failed"; status: number | null }>("/api/agent/push/test", { body: { endpoint } }),
  emailChannel: () => api<EmailChannelSettings>("/api/agent/email"),
  patchEmailChannel: (body: EmailChannelPatch) => api<EmailChannelSettings>("/api/agent/email", { method: "PATCH", body: { ...body } }),
  testEmail: () => api<EmailTestResult>("/api/agent/email/test", { method: "POST" }),
  messageEmail: (conversationId: string, messageId: string) =>
    api<EmailOriginal>(`/api/agent/conversations/${enc(conversationId)}/messages/${enc(messageId)}/email`),
  auditLog: (filters: { action?: string; actor?: string; cursor?: string | null }) =>
    api<Page<AuditEntry>>(`/api/agent/audit-log${auditSearch(filters)}`),
  auditLogExportUrl: (filters: { action?: string; actor?: string }) => `/api/agent/audit-log/export${auditSearch(filters)}`,

  sso: () => api<SsoSettings>("/api/agent/sso"),
  saveSso: (body: SsoSettingsPatch) => api<SsoSettings>("/api/agent/sso", { method: "PUT", body: { ...body } }),
  testSso: (issuer: string) => api<SsoTestResult>("/api/agent/sso/test", { body: { issuer } }),
};

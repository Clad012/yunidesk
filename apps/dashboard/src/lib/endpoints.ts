import type {
  AdminSettings,
  Agent,
  AgentConversation,
  AgentRole,
  AgentSendMessageInput,
  Attachment,
  CannedResponse,
  Contact,
  ConversationStatus,
  InboxCounts,
  Invite,
  Message,
  Page,
  PublicAgent,
} from "yunidesk";
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
}

export const queryKeys = {
  bootstrap: ["bootstrap"] as const,
  counts: ["counts"] as const,
  conversationLists: ["conversations"] as const,
  conversationList: (view: InboxView, q: string, contactId?: string) => ["conversations", view, q, contactId ?? ""] as const,
  conversation: (id: string) => ["conversation", id] as const,
  messages: (id: string) => ["messages", id] as const,
  contacts: (q: string) => ["contacts", q] as const,
  contact: (id: string) => ["contact", id] as const,
  team: ["team"] as const,
  settings: ["settings"] as const,
  canned: ["canned"] as const,
};

const enc = encodeURIComponent;

export const endpoints = {
  authStatus: () => api<{ needsSetup: boolean }>("/api/agent/auth/status"),
  setup: (body: { setupToken: string; name: string; email: string; password: string }) =>
    api<{ agent: Agent }>("/api/agent/auth/setup", { body }),
  login: (body: { email: string; password: string }) => api<{ agent: Agent }>("/api/agent/auth/login", { body }),
  logout: () => api<{ ok: true }>("/api/agent/auth/logout", { method: "POST" }),
  invite: (token: string) => api<{ email: string; role: AgentRole }>(`/api/agent/auth/invites/${enc(token)}`),
  acceptInvite: (token: string, body: { name: string; password: string }) =>
    api<{ agent: Agent }>(`/api/agent/auth/invites/${enc(token)}/accept`, { body }),

  bootstrap: () => api<Bootstrap>("/api/agent/bootstrap"),
  counts: () => api<InboxCounts>("/api/agent/conversations/counts"),
  conversations: (params: { view: InboxView; q?: string; cursor?: string | null; contactId?: string }) => {
    const search = new URLSearchParams({ view: params.view });
    if (params.q) search.set("q", params.q);
    if (params.cursor) search.set("cursor", params.cursor);
    if (params.contactId) search.set("contactId", params.contactId);
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
};

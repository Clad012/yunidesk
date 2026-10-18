// Shapes shared by the server, the dashboard, the web widget and the React Native SDK.
// Timestamps are Unix epoch milliseconds.

export type Locale = "en" | "fr";
export type LocalizedText = Partial<Record<Locale, string>>;

export type ConversationStatus = "open" | "snoozed" | "resolved";
export type AuthorType = "contact" | "agent" | "system";
/** `note` is internal to the team and is never sent to a contact. */
export type MessageKind = "text" | "note" | "event";
/** `email`: the conversation came in by email and team replies are sent as emails. */
export type Channel = "web" | "ios" | "android" | "email";
export type AgentRole = "owner" | "agent";
export type ReplyTime = "minutes" | "hour" | "day";

export type AttributeValue = string | number | boolean | null;
export type Attributes = Record<string, AttributeValue>;

export interface PublicAgent {
  id: string;
  name: string;
  avatarUrl: string | null;
  /** An API key acting as a teammate (an assistant or an integration). */
  isBot?: boolean;
}

export interface Agent extends PublicAgent {
  email: string;
  role: AgentRole;
  createdAt: number;
  lastSeenAt: number | null;
}

export interface Attachment {
  id: string;
  fileName: string;
  contentType: string;
  size: number;
  /** Short-lived signed URL; refetch the message to renew it. */
  url: string;
  isImage: boolean;
  width: number | null;
  height: number | null;
}

export type SystemEvent =
  | { type: "resolved"; agentName: string | null }
  | { type: "reopened"; agentName: string | null }
  | { type: "snoozed"; agentName: string | null; until: number }
  | { type: "assigned"; agentName: string | null; assigneeName: string | null }
  /** The customer asked for a person: the AI assistant stops answering this conversation. */
  | { type: "handed_off"; agentName: null }
  /** Team only: a reply could not be sent by email after every retry. */
  | { type: "email_failed"; agentName: null; messageId: string; reason: string | null };

export interface Message {
  id: string;
  conversationId: string;
  authorType: AuthorType;
  /** Set for agent messages and notes. */
  agent: PublicAgent | null;
  kind: MessageKind;
  body: string;
  event: SystemEvent | null;
  attachments: Attachment[];
  /** Echo of the id the sender generated, used to reconcile optimistic messages. */
  clientId: string | null;
  createdAt: number;
  /** Written by the AI assistant: always shown as such, with a way to reach a person. */
  ai?: boolean;
  /** Team only: set on messages that travelled by email. */
  email?: MessageEmail;
}

export interface MessagePreview {
  body: string;
  authorType: AuthorType;
  authorName: string | null;
  attachmentCount: number;
}

export interface Rating {
  /** 1 = bad, 2 = okay, 3 = great */
  score: 1 | 2 | 3;
  comment: string | null;
  createdAt: number;
}

/** A conversation as the contact sees it. */
export interface ContactConversation {
  id: string;
  status: ConversationStatus;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number;
  lastMessage: MessagePreview | null;
  unreadCount: number;
  /** When a teammate last read the conversation; drives "Seen". */
  agentLastReadAt: number | null;
  /** Teammates who replied, most recent first. */
  participants: PublicAgent[];
  rating: Rating | null;
  /** The AI assistant answers it (false once the customer asked for a person, or it has no assistant). */
  aiActive?: boolean;
}

export interface ContactProfile {
  id: string;
  name: string | null;
  email: string | null;
  isIdentified: boolean;
}

export interface Contact {
  id: string;
  externalId: string | null;
  name: string | null;
  email: string | null;
  /** False for an address an anonymous visitor typed and hasn't confirmed yet. */
  emailVerified: boolean;
  avatarUrl: string | null;
  attributes: Attributes;
  isIdentified: boolean;
  lastChannel: Channel | null;
  createdAt: number;
  lastSeenAt: number | null;
  online: boolean;
}

/** A conversation as a teammate sees it. */
export interface AgentConversation {
  id: string;
  status: ConversationStatus;
  channel: Channel;
  contact: Contact;
  assignee: PublicAgent | null;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number;
  lastMessage: MessagePreview | null;
  /** True when the contact wrote after the team last read it. */
  unread: boolean;
  contactLastReadAt: number | null;
  agentLastReadAt: number | null;
  snoozedUntil: number | null;
  rating: Rating | null;
  /** The AI assistant answers it (false once the customer asked for a person, or it has no assistant). */
  aiActive?: boolean;
  /** Email conversations: the subject of the customer's first email. */
  subject?: string | null;
}

export interface WidgetSettings {
  teamName: string;
  brandColor: string;
  greeting: LocalizedText;
  intro: LocalizedText;
  replyTime: ReplyTime;
  launcherPosition: "right" | "left";
  allowAnonymous: boolean;
  askEmailForAnonymous: boolean;
}

/** Settings plus live team info, as sent to the widget. */
export interface WidgetConfig extends WidgetSettings {
  agents: PublicAgent[];
  online: boolean;
  /** Present when an AI assistant answers this visitor first. */
  assistant?: { name: string } | null;
}

export interface AdminSettings extends WidgetSettings {
  allowedOrigins: string[];
  webhookUrl: string | null;
  hasWebhookSecret: boolean;
  retentionDays: number;
}

export interface CannedResponse {
  id: string;
  shortcut: string;
  title: string;
  body: string;
  createdAt: number;
}

export interface Invite {
  id: string;
  email: string;
  role: AgentRole;
  createdAt: number;
  expiresAt: number;
}

export interface InboxCounts {
  mine: number;
  unassigned: number;
  open: number;
  snoozed: number;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

// ---- Realtime ----

export type ContactServerEvent =
  | { type: "ready" }
  /** The assistant's reply as it is written (the whole text so far); the final message follows as message.created. */
  | { type: "assistant.delta"; conversationId: string; streamId: string; text: string }
  /** The assistant started, finished or gave up on a reply. */
  | { type: "assistant.status"; conversationId: string; streamId: string; status: "thinking" | "done" | "failed" }
  | { type: "message.created"; message: Message; conversation: ContactConversation }
  | { type: "conversation.updated"; conversation: ContactConversation }
  | { type: "conversation.read"; conversationId: string; at: number }
  | { type: "typing"; conversationId: string; agent: PublicAgent; isTyping: boolean }
  | { type: "presence"; online: boolean };

export type AgentServerEvent =
  | { type: "ready"; onlineAgentIds: string[] }
  | { type: "message.created"; message: Message; conversation: AgentConversation }
  | { type: "conversation.updated"; conversation: AgentConversation }
  | { type: "conversation.read"; conversationId: string; by: "contact" | "agent"; at: number }
  | { type: "typing"; conversationId: string; by: "contact"; isTyping: boolean }
  | { type: "typing"; conversationId: string; by: "agent"; agent: PublicAgent; isTyping: boolean; internal?: boolean }
  | { type: "presence"; onlineAgentIds: string[] }
  | { type: "contact.presence"; contactId: string; online: boolean }
  | { type: "contact.deleted"; contactId: string };

export type ClientEvent =
  /** `internal` (team only): a teammate writing a note; never shown to the contact. */
  | { type: "typing"; conversationId: string; isTyping: boolean; internal?: boolean }
  | { type: "ping" };

// ---- API payloads ----

export interface SessionResponse {
  token: string;
  expiresAt: number;
  contact: ContactProfile;
  /** Set for anonymous visitors so the session survives a reload. */
  visitorToken: string | null;
}

export interface BootstrapResponse {
  contact: ContactProfile;
  config: WidgetConfig;
  conversations: ContactConversation[];
}

/** An FAQ entry shown in the messenger's Help section (knowledge items of kind `faq`). */
export interface HelpArticle {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
}

export interface SendMessageInput {
  body: string;
  attachmentIds?: string[];
  clientId: string;
}

export interface AgentSendMessageInput extends SendMessageInput {
  kind?: "text" | "note";
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}

// ---- API keys and webhook endpoints ----

/**
 * What an API key may do. Keys never reach team management, settings, exports or erasure.
 * - conversations:read  list and read conversations, messages, teammates
 * - conversations:write reply, add notes, upload attachments, assign, snooze, resolve
 * - contacts:read       list and read contacts
 * - webhooks:write      manage the webhook endpoints this key created
 * - assistant:write     configure the AI assistant: settings, OpenRouter key, knowledge, tools
 */
export const API_SCOPES = [
  "conversations:read",
  "conversations:write",
  "contacts:read",
  "webhooks:write",
  "assistant:write",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export interface ApiKey {
  id: string;
  name: string;
  /** First characters of the key, to recognise it ("ydk_3f9k2m…"). */
  prefix: string;
  scopes: ApiScope[];
  /** The teammate this key acts as; its name shows on replies. */
  bot: PublicAgent;
  createdAt: number;
  expiresAt: number | null;
  lastUsedAt: number | null;
  revokedAt: number | null;
}

/** Returned once, when the key is created. Store `token` now: it can't be shown again. */
export interface CreatedApiKey {
  apiKey: ApiKey;
  token: string;
}

export interface WebhookEndpoint {
  id: string;
  url: string;
  description: string | null;
  /** Event names, or ["*"] for all of them. */
  events: string[];
  status: "enabled" | "disabled";
  disabledReason: string | null;
  /** Set when an API key created it; revoking that key disables the endpoint. */
  apiKeyId: string | null;
  createdAt: number;
  updatedAt: number;
}

/** Returned when an endpoint is created or its secret is rolled. The secret can't be shown again. */
export interface WebhookEndpointWithSecret {
  endpoint: WebhookEndpoint;
  secret: string;
}

export interface WebhookDelivery {
  id: string;
  eventId: string;
  eventType: string;
  status: "pending" | "succeeded" | "failed";
  attempts: number;
  nextAttemptAt: number | null;
  lastStatusCode: number | null;
  lastError: string | null;
  createdAt: number;
  completedAt: number | null;
}

// ---- AI assistant ----

export interface AssistantSettings {
  enabled: boolean;
  /** Shown on its messages ("Yuniqa assistant"). */
  name: string;
  /** How it should answer: tone, scope, what to never do. */
  instructions: string;
  /** OpenRouter model id. */
  model: string;
  /** Whether anonymous visitors (not signed in to your app) get the assistant. */
  allowAnonymous: boolean;
  /** Daily spend limit in USD; past it, conversations go straight to the team. */
  dailyBudgetUsd: number;
  hasOpenRouterKey: boolean;
}

export type AssistantSettingsPatch = Partial<Omit<AssistantSettings, "hasOpenRouterKey">>;

export interface KnowledgeItem {
  id: string;
  /**
   * `faq`: a question and its answer, shown to customers in the messenger's Help section and used
   * by the assistant. `article`: background knowledge only the assistant reads.
   */
  kind: "faq" | "article";
  title: string;
  body: string;
  /** The language it is written in, or null for every language. Help shows customers their own. */
  locale: Locale | null;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeInput {
  kind: "faq" | "article";
  title: string;
  body: string;
  /** The language it is written in; null or left out for every language. */
  locale?: Locale | null;
}

/**
 * A tool the assistant may call: Yunidesk POSTs the arguments to `url`, signed like webhooks
 * (X-Yunidesk-Signature), with the customer it is helping; your server answers with JSON.
 */
export interface AssistantTool {
  id: string;
  /** snake_case, what the model calls. */
  name: string;
  description: string;
  /** JSON schema of the arguments (type "object"). */
  inputSchema: Record<string, unknown>;
  url: string;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AssistantToolInput {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  url: string;
  enabled?: boolean;
}

/** The body Yunidesk POSTs to a tool's URL. */
export interface AssistantToolCall {
  id: string;
  tool: string;
  arguments: Record<string, unknown>;
  conversationId: string;
  contact: { id: string; externalId: string | null; email: string | null; name: string | null; isIdentified: boolean };
  createdAt: number;
}

export interface AssistantUsage {
  /** UTC day, YYYY-MM-DD. */
  day: string;
  replies: number;
  costUsd: number;
  budgetUsd: number;
}

// ---- Email channel ----

/** How a message travelled by email (team only). */
export interface MessageEmail {
  direction: "inbound" | "outbound";
  /** Outbound: `pending` until the provider accepts it, `failed` after the last retry. Null for inbound. */
  status: "pending" | "sent" | "failed" | null;
  /** Outbound: why the last attempt failed. */
  error: string | null;
  /**
   * Inbound: true when the sender's domain vouched for it (DMARC, or DKIM aligned with the From domain).
   * False means anyone could have written it: the From address is not proof. Null for outbound.
   */
  verified: boolean | null;
}

/** The whole inbound email behind a message ("Show full email"). Always plain text. */
export interface EmailOriginal {
  messageId: string;
  from: { address: string; name: string | null };
  to: string;
  subject: string | null;
  /** The Date header (ISO 8601 when it parses). */
  sentAt: string | null;
  text: string;
  authentication: EmailAuthentication;
  /** Attachments that were not imported (type, size or count limits). */
  skippedAttachments: string[];
}

export type EmailAuthResult = "pass" | "fail" | "softfail" | "neutral" | "none" | "temperror" | "permerror" | "policy";

/** What the receiving server found when it checked the sender (Authentication-Results). */
export interface EmailAuthentication {
  spf: EmailAuthResult | null;
  dkim: EmailAuthResult | null;
  dmarc: EmailAuthResult | null;
  verified: boolean;
}

/** `auto`: Cloudflare Email Service when its binding is set up, otherwise Resend. */
export type EmailProviderSetting = "auto" | "cloudflare" | "resend";
export type EmailProvider = "cloudflare" | "resend";

export interface EmailChannelSettings {
  enabled: boolean;
  /** Where customers write (support@example.com): EMAIL_INBOUND_ADDRESS, or set here. */
  inboundAddress: string | null;
  /** True when the address comes from EMAIL_INBOUND_ADDRESS (then it can't be changed here). */
  inboundAddressFromEnv: boolean;
  /** Replies come from "<teammate> via <fromName>" <fromAddress>. fromName defaults to the team name. */
  fromName: string | null;
  fromAddress: string | null;
  provider: EmailProviderSetting;
  status: EmailChannelStatus;
}

export interface EmailChannelStatus {
  /** The provider replies go through right now, or null when none is configured. */
  activeProvider: EmailProvider | null;
  /** The `SEND_EMAIL` binding (Cloudflare Email Service) is configured. */
  cloudflareReady: boolean;
  /** RESEND_API_KEY is set. */
  resendReady: boolean;
  /** The address replies come from (fromAddress, else EMAIL_FROM, else the inbound address). */
  effectiveFromAddress: string | null;
  /** Customers' replies go to reply+<token>@<this domain>. */
  replyDomain: string | null;
  lastInboundAt: number | null;
  lastOutboundAt: number | null;
}

export interface EmailChannelPatch {
  enabled?: boolean;
  inboundAddress?: string | null;
  fromName?: string | null;
  fromAddress?: string | null;
  provider?: EmailProviderSetting;
}

export interface EmailTestResult {
  ok: boolean;
  provider: EmailProvider | null;
  to: string;
  error: string | null;
}

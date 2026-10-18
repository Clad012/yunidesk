// Verify webhook calls from the support worker in your backend.
// Header: X-Yunidesk-Signature: t=<ms>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
// While a secret is being rolled the header carries one v1 per active secret.

export type WebhookEventName =
  | "conversation.created"
  | "message.created"
  | "conversation.updated"
  | "conversation.unread_reply"
  | "conversation.rated"
  /** Sent by "Send test event"; carries no data. */
  | "ping";

export const WEBHOOK_EVENT_NAMES: readonly Exclude<WebhookEventName, "ping">[] = [
  "conversation.created",
  "message.created",
  "conversation.updated",
  "conversation.unread_reply",
  "conversation.rated",
];

/** One field an event carries, for filters ("message.body contains refund"). */
export interface WebhookEventField {
  /** Dotted path inside `data`. */
  path: string;
  type: "string" | "number" | "boolean";
  title: { en: string; fr: string };
  /** Every value it can take, when the list is closed. */
  values?: readonly (string | number)[];
}

export interface WebhookEventDescriptor {
  name: Exclude<WebhookEventName, "ping">;
  title: { en: string; fr: string };
  description: { en: string; fr: string };
  fields: readonly WebhookEventField[];
}

const conversationId: WebhookEventField = { path: "conversationId", type: "string", title: { en: "Conversation", fr: "Conversation" } };
const actorType: WebhookEventField = {
  path: "actor.type",
  type: "string",
  title: { en: "Done by", fr: "Fait par" },
  values: ["contact", "agent", "bot", "system"],
};
const priorityField: WebhookEventField = {
  path: "priority",
  type: "string",
  title: { en: "Priority", fr: "Priorité" },
  values: ["low", "normal", "high", "urgent"],
};
const teamField: WebhookEventField = { path: "team", type: "string", title: { en: "Team", fr: "Équipe" } };
const contactFields: WebhookEventField[] = [
  { path: "contact.name", type: "string", title: { en: "Customer name", fr: "Nom du client" } },
  { path: "contact.email", type: "string", title: { en: "Customer email", fr: "E-mail du client" } },
];

/**
 * Every event Yunidesk sends, described for people and for integrations that
 * build their trigger lists from it (GET /api/agent/events). New events are
 * added here, so integrations offer them without shipping anything.
 */
export const WEBHOOK_EVENT_CATALOG: readonly WebhookEventDescriptor[] = [
  {
    name: "conversation.created",
    title: { en: "New conversation", fr: "Nouvelle conversation" },
    description: { en: "A customer starts a conversation.", fr: "Un client commence une conversation." },
    fields: [conversationId, { path: "channel", type: "string", title: { en: "Channel", fr: "Canal" } }, ...contactFields],
  },
  {
    name: "message.created",
    title: { en: "New message", fr: "Nouveau message" },
    description: {
      en: "A message the customer can see is posted, by the customer or the team (not internal notes).",
      fr: "Un message visible par le client est publié, par le client ou l'équipe (pas les notes internes).",
    },
    fields: [
      conversationId,
      actorType,
      ...contactFields,
      { path: "message.body", type: "string", title: { en: "Message", fr: "Message" } },
      { path: "message.attachmentCount", type: "number", title: { en: "Attachments", fr: "Pièces jointes" } },
    ],
  },
  {
    name: "conversation.updated",
    title: { en: "Conversation updated", fr: "Conversation modifiée" },
    description: {
      en: "A conversation's status, assignee, team, priority, tags or custom fields change.",
      fr: "Le statut, la personne assignée, l'équipe, la priorité, les tags ou les champs personnalisés d'une conversation changent.",
    },
    fields: [
      conversationId,
      actorType,
      { path: "status", type: "string", title: { en: "Status", fr: "Statut" }, values: ["open", "snoozed", "resolved"] },
      { path: "assigneeId", type: "string", title: { en: "Assigned to", fr: "Assignée à" } },
      priorityField,
      teamField,
    ],
  },
  {
    name: "conversation.unread_reply",
    title: { en: "Reply left unread", fr: "Réponse non lue" },
    description: {
      en: "A team reply is still unread by the customer after 2 minutes.",
      fr: "Une réponse de l'équipe n'est toujours pas lue par le client après 2 minutes.",
    },
    fields: [conversationId, ...contactFields, { path: "preview", type: "string", title: { en: "Reply", fr: "Réponse" } }],
  },
  {
    name: "conversation.rated",
    title: { en: "Conversation rated", fr: "Conversation notée" },
    description: {
      en: "A customer rates a resolved conversation (1 bad, 2 okay, 3 great).",
      fr: "Un client note une conversation résolue (1 mauvaise, 2 correcte, 3 excellente).",
    },
    fields: [
      conversationId,
      { path: "score", type: "number", title: { en: "Score", fr: "Note" }, values: [1, 2, 3] },
      { path: "comment", type: "string", title: { en: "Comment", fr: "Commentaire" } },
    ],
  },
];

export interface WebhookPayload<T = unknown> {
  /** Unique per event (`evt_…`), identical across retries: use it to drop duplicates. */
  id: string;
  event: WebhookEventName;
  createdAt: number;
  data: T;
}

/** Who caused an event. Bots are API keys acting as teammates. */
export interface WebhookActor {
  type: "contact" | "agent" | "bot" | "system";
  id: string | null;
}

export interface WebhookContactSummary {
  id: string;
  /** Your user id, when the contact was identified with a signed token. */
  externalId: string | null;
  email: string | null;
  name: string | null;
}

export interface ConversationCreatedData extends WebhookConversationLabels {
  conversationId: string;
  contactId: string;
  channel: string;
  contact: WebhookContactSummary;
}

export interface MessageCreatedData {
  conversationId: string;
  contactId: string;
  actor: WebhookActor;
  contact: WebhookContactSummary;
  message: {
    id: string;
    authorType: "contact" | "agent" | "system";
    agentId: string | null;
    body: string;
    attachmentCount: number;
    createdAt: number;
  };
}

/** Team-only state of a conversation, carried by conversation webhooks (never sent to contacts). */
export interface WebhookConversationLabels {
  priority: "low" | "normal" | "high" | "urgent";
  /** Tag names, alphabetical. */
  tags: string[];
  /** Values keyed by field key (text, number, select, checkbox, date as "YYYY-MM-DD"). */
  customFields: Record<string, string | number | boolean>;
  /** The team it was routed or moved to, and its name. */
  teamId: string | null;
  team: string | null;
}

export interface ConversationUpdatedData extends WebhookConversationLabels {
  conversationId: string;
  contactId: string;
  actor: WebhookActor;
  status: "open" | "snoozed" | "resolved";
  assigneeId: string | null;
}

export interface UnreadReplyData {
  conversationId: string;
  contact: WebhookContactSummary;
  agentName: string | null;
  preview: string | null;
}

export interface ConversationRatedData {
  conversationId: string;
  score: 1 | 2 | 3;
  comment: string | null;
}

const encoder = new TextEncoder();

/** True when `rawBody` was signed with `secret` less than `toleranceMs` ago. Pass the body exactly as received. */
export async function verifyWebhookSignature(
  secret: string,
  signatureHeader: string | null,
  rawBody: string,
  options: { toleranceMs?: number; now?: number } = {},
): Promise<boolean> {
  if (!signatureHeader) return false;
  let timestamp = Number.NaN;
  const candidates: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === "t") timestamp = Number(rest.join("="));
    else if (key === "v1") candidates.push(rest.join("="));
  }
  if (!Number.isFinite(timestamp) || candidates.length === 0) return false;
  const now = options.now ?? Date.now();
  if (Math.abs(now - timestamp) > (options.toleranceMs ?? 5 * 60 * 1000)) return false;

  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`)));
  const expected = Array.from(signature, (b) => b.toString(16).padStart(2, "0")).join("");
  let matched = false;
  // Compare against every candidate (no early exit), each in constant time.
  for (const given of candidates) {
    if (given.length !== expected.length) continue;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
    if (diff === 0) matched = true;
  }
  return matched;
}

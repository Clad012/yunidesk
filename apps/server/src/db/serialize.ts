import {
  isInlineImage,
  type Agent,
  type AgentConversation,
  type Attachment,
  type Attributes,
  type Contact,
  type ContactConversation,
  type ContactProfile,
  type Message,
  type MessagePreview,
  type PublicAgent,
  type Rating,
  type SystemEvent,
} from "yunidesk";
import type { Env } from "../env";
import { signFilePath } from "../lib/tokens";
import { selectIn, type AgentRow, type AttachmentRow, type ContactRow, type ConversationRow, type MessageRow } from "./rows";

export function toPublicAgent(row: Pick<AgentRow, "id" | "name" | "avatar_url"> & { kind?: AgentRow["kind"] }): PublicAgent {
  return { id: row.id, name: row.name, avatarUrl: row.avatar_url, ...(row.kind === "bot" ? { isBot: true } : {}) };
}

export function toAgent(row: AgentRow): Agent {
  return {
    ...toPublicAgent(row),
    email: row.email,
    role: row.role,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

export function toContact(row: ContactRow, online = false): Contact {
  return {
    id: row.id,
    externalId: row.external_id,
    name: row.name,
    email: row.email,
    emailVerified: row.email !== null && row.email_verified_at !== null,
    avatarUrl: row.avatar_url,
    attributes: parseAttributes(row.attributes),
    isIdentified: row.is_identified === 1,
    lastChannel: row.last_channel,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
    online,
  };
}

export function toContactProfile(row: ContactRow): ContactProfile {
  return { id: row.id, name: row.name, email: row.email, isIdentified: row.is_identified === 1 };
}

function parseAttributes(raw: string): Attributes {
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Attributes) : {};
  } catch {
    return {};
  }
}

/** All agents, keyed by id. The team is small, so one query per request is cheaper than joins. */
export async function loadAgents(env: Env): Promise<Map<string, AgentRow>> {
  const { results } = await env.DB.prepare("SELECT * FROM agents").all<AgentRow>();
  return new Map(results.map((row) => [row.id, row]));
}

export async function toAttachment(env: Env, origin: string, row: AttachmentRow): Promise<Attachment> {
  return {
    id: row.id,
    fileName: row.file_name,
    contentType: row.content_type,
    size: row.size,
    url: origin + (await signFilePath(env.SESSION_SECRET, row.id)),
    isImage: isInlineImage(row.content_type),
    width: row.width,
    height: row.height,
  };
}

export async function toMessages(
  env: Env,
  origin: string,
  rows: MessageRow[],
  agents?: Map<string, AgentRow>,
): Promise<Message[]> {
  if (rows.length === 0) return [];
  const agentMap = agents ?? (await loadAgents(env));
  const attachmentRows = await selectIn<AttachmentRow>(
    env.DB,
    rows.map((r) => r.id),
    (ph) => `SELECT * FROM attachments WHERE message_id IN (${ph}) ORDER BY created_at`,
  );
  const byMessage = new Map<string, Attachment[]>();
  for (const row of attachmentRows) {
    const list = byMessage.get(row.message_id!) ?? [];
    list.push(await toAttachment(env, origin, row));
    byMessage.set(row.message_id!, list);
  }
  return rows.map((row) => {
    const agent = row.agent_id ? agentMap.get(row.agent_id) : undefined;
    return {
      id: row.id,
      conversationId: row.conversation_id,
      authorType: row.author_type,
      agent: agent ? toPublicAgent(agent) : null,
      kind: row.kind,
      body: row.body,
      event: row.event ? (JSON.parse(row.event) as SystemEvent) : null,
      attachments: byMessage.get(row.id) ?? [],
      clientId: row.client_id,
      createdAt: row.created_at,
    };
  });
}

function toPreview(row: ConversationRow): MessagePreview | null {
  if (!row.last_message_author) return null;
  return {
    body: row.last_message_body ?? "",
    authorType: row.last_message_author,
    authorName: row.last_message_author_name,
    attachmentCount: row.last_message_attachments,
  };
}

function toRating(row: ConversationRow): Rating | null {
  if (!row.rating_score || !row.rating_at) return null;
  return { score: row.rating_score, comment: row.rating_comment, createdAt: row.rating_at };
}

export async function toAgentConversations(
  env: Env,
  rows: ConversationRow[],
  options: { agents?: Map<string, AgentRow>; onlineContactIds?: Set<string> } = {},
): Promise<AgentConversation[]> {
  if (rows.length === 0) return [];
  const agents = options.agents ?? (await loadAgents(env));
  const contacts = await selectIn<ContactRow>(
    env.DB,
    rows.map((r) => r.contact_id),
    (ph) => `SELECT * FROM contacts WHERE id IN (${ph})`,
  );
  const contactMap = new Map(contacts.map((c) => [c.id, c]));
  const out: AgentConversation[] = [];
  for (const row of rows) {
    const contact = contactMap.get(row.contact_id);
    if (!contact) continue;
    const assignee = row.assignee_id ? agents.get(row.assignee_id) : undefined;
    out.push({
      id: row.id,
      status: row.status,
      channel: row.channel,
      contact: toContact(contact, options.onlineContactIds?.has(contact.id) ?? false),
      assignee: assignee ? toPublicAgent(assignee) : null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastMessageAt: row.last_message_at,
      lastMessage: toPreview(row),
      unread: (row.last_contact_message_at ?? 0) > (row.agent_last_read_at ?? 0),
      contactLastReadAt: row.contact_last_read_at,
      agentLastReadAt: row.agent_last_read_at,
      snoozedUntil: row.snoozed_until,
      rating: toRating(row),
    });
  }
  return out;
}

export async function toContactConversations(env: Env, rows: ConversationRow[]): Promise<ContactConversation[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const agents = await loadAgents(env);

  const unreadRows = await selectIn<{ conversation_id: string; n: number }>(
    env.DB,
    ids,
    (ph) => `SELECT m.conversation_id, COUNT(*) AS n
      FROM messages m JOIN conversations c ON c.id = m.conversation_id
      WHERE m.conversation_id IN (${ph}) AND m.author_type = 'agent' AND m.kind = 'text'
        AND m.created_at > COALESCE(c.contact_last_read_at, 0)
      GROUP BY m.conversation_id`,
  );
  const unread = new Map(unreadRows.map((r) => [r.conversation_id, r.n]));

  const participantRows = await selectIn<{ conversation_id: string; agent_id: string; at: number }>(
    env.DB,
    ids,
    (ph) => `SELECT conversation_id, agent_id, MAX(created_at) AS at FROM messages
      WHERE conversation_id IN (${ph}) AND author_type = 'agent' AND kind = 'text' AND agent_id IS NOT NULL
      GROUP BY conversation_id, agent_id`,
  );
  const participants = new Map<string, { agent_id: string; at: number }[]>();
  for (const row of participantRows) {
    const list = participants.get(row.conversation_id) ?? [];
    list.push(row);
    participants.set(row.conversation_id, list);
  }

  return rows.map((row) => ({
    id: row.id,
    // Snoozing is a team-side tool; to the contact the conversation is simply open.
    status: row.status === "snoozed" ? "open" : row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: row.last_message_at,
    lastMessage: toPreview(row),
    unreadCount: unread.get(row.id) ?? 0,
    agentLastReadAt: row.agent_last_read_at,
    participants: (participants.get(row.id) ?? [])
      .sort((a, b) => b.at - a.at)
      .slice(0, 3)
      .map((p) => agents.get(p.agent_id))
      .filter((a): a is AgentRow => Boolean(a))
      .map(toPublicAgent),
    rating: toRating(row),
  }));
}

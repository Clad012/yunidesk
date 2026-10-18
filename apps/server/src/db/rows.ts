import type { AgentRole, AuthorType, Channel, ConversationFieldType, ConversationPriority, ConversationStatus, MessageKind, TagColor } from "yunidesk";

export interface AgentRow {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  role: AgentRole;
  /** Bots act only through an API key: no sign-in, no automatic assignment, hidden from the team. */
  kind: "human" | "bot";
  password_hash: string;
  disabled_at: number | null;
  created_at: number;
  last_seen_at: number | null;
}

export interface ContactRow {
  id: string;
  external_id: string | null;
  email: string | null;
  name: string | null;
  avatar_url: string | null;
  attributes: string;
  is_identified: number;
  email_verified_at: number | null;
  last_channel: Channel | null;
  created_at: number;
  last_seen_at: number | null;
}

export interface ConversationRow {
  id: string;
  contact_id: string;
  status: ConversationStatus;
  channel: Channel;
  assignee_id: string | null;
  created_at: number;
  updated_at: number;
  last_message_at: number;
  last_message_body: string | null;
  last_message_author: AuthorType | null;
  last_message_author_name: string | null;
  last_message_attachments: number;
  last_contact_message_at: number | null;
  last_agent_message_at: number | null;
  contact_last_read_at: number | null;
  agent_last_read_at: number | null;
  contact_notified_at: number | null;
  snoozed_until: number | null;
  resolved_at: number | null;
  rating_score: 1 | 2 | 3 | null;
  rating_comment: string | null;
  rating_at: number | null;
  ai_state: "active" | "handed_off" | "human" | "off" | null;
  ai_lock_until: number | null;
  priority: ConversationPriority;
  /** JSON object of custom field values, keyed by field key. */
  custom_fields: string;
  // Report facts (migration 0013), kept up to date on every write.
  first_contact_message_at: number | null;
  first_human_reply_at: number | null;
  human_replied: number;
  ai_involved: number;
  reopened_count: number;
  /** When the away message was last sent (business hours); once per closed period. */
  away_notified_at: number | null;
  /** Email conversations: the subject of the first email. */
  subject: string | null;
}

export interface TagRow {
  id: string;
  name: string;
  color: TagColor;
  created_at: number;
}

export interface ConversationFieldRow {
  id: string;
  key: string;
  label: string;
  type: ConversationFieldType;
  /** JSON array, select fields only. */
  options: string | null;
  position: number;
  created_at: number;
}

export interface MessageRow {
  id: string;
  conversation_id: string;
  author_type: AuthorType;
  agent_id: string | null;
  kind: MessageKind;
  body: string;
  event: string | null;
  client_id: string | null;
  created_at: number;
  /** 1 when the AI assistant wrote it. */
  ai: number;
  // Email channel (all NULL for chat messages).
  email_direction: "inbound" | "outbound" | null;
  email_message_id: string | null;
  email_in_reply_to: string | null;
  email_status: "pending" | "sent" | "failed" | null;
  email_error: string | null;
  email_attempts: number;
  email_next_attempt_at: number | null;
  email_verified: number | null;
}

export interface AttachmentRow {
  id: string;
  message_id: string | null;
  conversation_id: string | null;
  uploader_type: "contact" | "agent";
  uploader_id: string;
  r2_key: string;
  file_name: string;
  content_type: string;
  size: number;
  width: number | null;
  height: number | null;
  created_at: number;
}

/** D1 allows 100 bound parameters per statement; run IN (...) queries in chunks. */
export async function selectIn<T>(
  db: D1Database,
  ids: readonly string[],
  build: (placeholders: string) => string,
  extraBindings: unknown[] = [],
): Promise<T[]> {
  const unique = [...new Set(ids)];
  const out: T[] = [];
  for (let i = 0; i < unique.length; i += 90) {
    const chunk = unique.slice(i, i + 90);
    const sql = build(chunk.map(() => "?").join(","));
    const { results } = await db
      .prepare(sql)
      .bind(...extraBindings, ...chunk)
      .all<T>();
    out.push(...results);
  }
  return out;
}

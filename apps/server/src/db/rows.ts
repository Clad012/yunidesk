import type { AgentRole, AuthorType, Channel, ConversationStatus, MessageKind } from "yunidesk";

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
  /** When the away message was last sent (business hours); once per closed period. */
  away_notified_at: number | null;
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

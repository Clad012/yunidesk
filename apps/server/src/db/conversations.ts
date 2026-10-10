import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_MESSAGE_LENGTH,
  type Channel,
  type ConversationStatus,
  type Message,
  type MessageKind,
  type SystemEvent,
} from "yunidesk";
import type { Env } from "../env";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { contactChannel, notifyAgents, notifyContact } from "../lib/realtime";
import { sendWebhook } from "../lib/webhooks";
import type { AgentRow, AttachmentRow, ConversationRow, MessageRow } from "./rows";
import { selectIn } from "./rows";
import { loadAgents, toAgentConversations, toContactConversations, toMessages } from "./serialize";

/** What a contact may see: their and the team's messages, plus the "resolved" marker. Never notes. */
export const CONTACT_VISIBLE_SQL = `(kind = 'text' OR (kind = 'event' AND json_extract(event, '$.type') = 'resolved'))`;

export function isVisibleToContact(row: Pick<MessageRow, "kind" | "event">): boolean {
  if (row.kind === "text") return true;
  if (row.kind !== "event" || !row.event) return false;
  return (JSON.parse(row.event) as SystemEvent).type === "resolved";
}

export type Author =
  | { type: "contact"; contactId: string }
  | { type: "agent"; agent: AgentRow }
  | { type: "system"; agent: AgentRow | null };

export interface MessageDraft {
  body: string;
  attachmentIds: string[];
  clientId: string | null;
}

const PREVIEW_LENGTH = 280;

function sameAuthor(row: MessageRow, author: Author): boolean {
  if (author.type === "contact") return row.author_type === "contact";
  return row.author_type === author.type && row.agent_id === (author.agent?.id ?? null);
}

export async function getConversation(env: Env, id: string): Promise<ConversationRow> {
  const row = await env.DB.prepare("SELECT * FROM conversations WHERE id = ?").bind(id).first<ConversationRow>();
  if (!row) throw notFound("Conversation not found");
  return row;
}

/** Throws unless the draft can be sent by this author. Returns the attachment rows. */
export async function validateDraft(env: Env, author: Author, draft: MessageDraft): Promise<AttachmentRow[]> {
  const body = draft.body.trim();
  if (body.length > MAX_MESSAGE_LENGTH) throw badRequest(`Messages are limited to ${MAX_MESSAGE_LENGTH} characters`);
  if (draft.attachmentIds.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    throw badRequest(`Up to ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message`);
  }
  if (!body && draft.attachmentIds.length === 0) throw badRequest("Message is empty");
  if (draft.attachmentIds.length === 0) return [];

  const rows = await selectIn<AttachmentRow>(
    env.DB,
    draft.attachmentIds,
    (ph) => `SELECT * FROM attachments WHERE id IN (${ph})`,
  );
  const uploaderType = author.type === "contact" ? "contact" : "agent";
  const uploaderId = author.type === "contact" ? author.contactId : author.agent?.id;
  const usable = rows.filter(
    (row) => row.message_id === null && row.uploader_type === uploaderType && row.uploader_id === uploaderId,
  );
  if (usable.length !== new Set(draft.attachmentIds).size) throw badRequest("Unknown or already used attachment");
  return usable;
}

export async function createConversation(
  env: Env,
  ctx: ExecutionContext,
  origin: string,
  contactId: string,
  channel: Channel,
  draft: MessageDraft,
): Promise<{ conversation: ConversationRow; message: Message }> {
  const author: Author = { type: "contact", contactId };
  const attachments = await validateDraft(env, author, draft);
  const now = Date.now();
  const id = newId("cnv");
  await env.DB.prepare(
    `INSERT INTO conversations (id, contact_id, status, channel, created_at, updated_at, last_message_at)
     VALUES (?, ?, 'open', ?, ?, ?, ?)`,
  )
    .bind(id, contactId, channel, now, now, now)
    .run();
  const conversation = await getConversation(env, id);
  const result = await insertMessage(env, ctx, origin, conversation, author, "text", draft, attachments);
  ctx.waitUntil(sendWebhook(env, "conversation.created", { conversationId: id, contactId, channel }));
  return result;
}

export async function postMessage(
  env: Env,
  ctx: ExecutionContext,
  origin: string,
  conversation: ConversationRow,
  author: Author,
  kind: Exclude<MessageKind, "event">,
  draft: MessageDraft,
): Promise<{ conversation: ConversationRow; message: Message }> {
  if (draft.clientId) {
    const existing = await env.DB.prepare("SELECT * FROM messages WHERE conversation_id = ? AND client_id = ?")
      .bind(conversation.id, draft.clientId)
      .first<MessageRow>();
    if (existing) {
      // Only the original author gets their message back; anyone else reusing the id is refused,
      // so a contact can't fish for a note by guessing its clientId.
      if (!sameAuthor(existing, author)) throw badRequest("Duplicate message id", "duplicate_client_id");
      const [message] = await toMessages(env, origin, [existing]);
      return { conversation, message: message! };
    }
  }
  const attachments = await validateDraft(env, author, draft);
  return insertMessage(env, ctx, origin, conversation, author, kind, draft, attachments);
}

async function insertMessage(
  env: Env,
  ctx: ExecutionContext,
  origin: string,
  conversation: ConversationRow,
  author: Author,
  kind: MessageKind,
  draft: MessageDraft,
  attachments: AttachmentRow[],
  event: SystemEvent | null = null,
): Promise<{ conversation: ConversationRow; message: Message }> {
  const now = Math.max(Date.now(), conversation.updated_at);
  const id = newId("msg");
  const body = draft.body.trim();
  const agent = author.type === "contact" ? null : author.agent;
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO messages (id, conversation_id, author_type, agent_id, kind, body, event, client_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      conversation.id,
      author.type,
      agent?.id ?? null,
      kind,
      body,
      event ? JSON.stringify(event) : null,
      draft.clientId,
      now,
    ),
  ];
  if (attachments.length > 0) {
    statements.push(
      env.DB.prepare(
        `UPDATE attachments SET message_id = ?, conversation_id = ?
         WHERE id IN (${attachments.map(() => "?").join(",")}) AND message_id IS NULL`,
      ).bind(id, conversation.id, ...attachments.map((a) => a.id)),
    );
  }

  if (kind === "text") {
    const preview = body.length > PREVIEW_LENGTH ? `${body.slice(0, PREVIEW_LENGTH - 1)}…` : body;
    const previewSet = `last_message_at = ?, last_message_body = ?, last_message_author = ?,
      last_message_author_name = ?, last_message_attachments = ?, updated_at = ?`;
    const previewValues = [now, preview, author.type, agent?.name ?? null, attachments.length, now];
    if (author.type === "contact") {
      statements.push(
        env.DB.prepare(
          `UPDATE conversations SET ${previewSet}, last_contact_message_at = ?, contact_last_read_at = ?,
             status = 'open', snoozed_until = NULL, resolved_at = NULL
           WHERE id = ?`,
        ).bind(...previewValues, now, now, conversation.id),
      );
    } else {
      statements.push(
        env.DB.prepare(
          `UPDATE conversations SET ${previewSet}, last_agent_message_at = ?, agent_last_read_at = ?,
             assignee_id = COALESCE(assignee_id, ?)
           WHERE id = ?`,
        ).bind(...previewValues, now, now, agent?.id ?? null, conversation.id),
      );
    }
  } else if (kind === "note") {
    statements.push(
      env.DB.prepare("UPDATE conversations SET updated_at = ?, agent_last_read_at = ? WHERE id = ?").bind(
        now,
        now,
        conversation.id,
      ),
    );
  } else {
    statements.push(env.DB.prepare("UPDATE conversations SET updated_at = ? WHERE id = ?").bind(now, conversation.id));
  }

  try {
    await env.DB.batch(statements);
  } catch (error) {
    // Two retries of the same send raced; return the one that won.
    if (draft.clientId && String(error).includes("UNIQUE")) {
      const existing = await env.DB.prepare("SELECT * FROM messages WHERE conversation_id = ? AND client_id = ?")
        .bind(conversation.id, draft.clientId)
        .first<MessageRow>();
      if (existing && sameAuthor(existing, author)) {
        const [message] = await toMessages(env, origin, [existing]);
        return { conversation, message: message! };
      }
    }
    throw error;
  }

  const updated = await getConversation(env, conversation.id);
  const row: MessageRow = {
    id,
    conversation_id: conversation.id,
    author_type: author.type,
    agent_id: agent?.id ?? null,
    kind,
    body,
    event: event ? JSON.stringify(event) : null,
    client_id: draft.clientId,
    created_at: now,
  };
  const agents = await loadAgents(env);
  const [message] = await toMessages(env, origin, [row], agents);

  ctx.waitUntil(broadcastMessage(env, updated, message!, row, agents));
  if (kind === "text") {
    ctx.waitUntil(
      sendWebhook(env, "message.created", {
        conversationId: conversation.id,
        contactId: conversation.contact_id,
        message: { id, authorType: author.type, agentId: agent?.id ?? null, body, attachmentCount: attachments.length, createdAt: now },
      }),
    );
    if (author.type === "agent") ctx.waitUntil(contactChannel(env, conversation.contact_id).scheduleUnreadCheck());
  }
  return { conversation: updated, message: message! };
}

async function broadcastMessage(
  env: Env,
  conversation: ConversationRow,
  message: Message,
  row: MessageRow,
  agents: Map<string, AgentRow>,
): Promise<void> {
  const [agentConversation] = await toAgentConversations(env, [conversation], { agents });
  const tasks: Promise<void>[] = [];
  if (agentConversation) tasks.push(notifyAgents(env, { type: "message.created", message, conversation: agentConversation }));
  if (row.kind !== "note") {
    const [contactConversation] = await toContactConversations(env, [conversation]);
    if (contactConversation) {
      tasks.push(
        notifyContact(
          env,
          conversation.contact_id,
          isVisibleToContact(row)
            ? { type: "message.created", message, conversation: contactConversation }
            : { type: "conversation.updated", conversation: contactConversation },
        ),
      );
    }
  }
  await Promise.all(tasks);
}

export interface ConversationPatch {
  status?: ConversationStatus;
  snoozedUntil?: number | null;
  assigneeId?: string | null;
}

export async function updateConversation(
  env: Env,
  ctx: ExecutionContext,
  origin: string,
  agent: AgentRow,
  conversation: ConversationRow,
  patch: ConversationPatch,
): Promise<ConversationRow> {
  const now = Date.now();
  const events: SystemEvent[] = [];
  const sets: string[] = [];
  const values: unknown[] = [];

  if (patch.assigneeId !== undefined && patch.assigneeId !== conversation.assignee_id) {
    let assigneeName: string | null = null;
    if (patch.assigneeId) {
      const assignee = await env.DB.prepare("SELECT * FROM agents WHERE id = ? AND disabled_at IS NULL")
        .bind(patch.assigneeId)
        .first<AgentRow>();
      if (!assignee) throw badRequest("Unknown teammate");
      assigneeName = assignee.name;
    }
    sets.push("assignee_id = ?");
    values.push(patch.assigneeId);
    events.push({ type: "assigned", agentName: agent.name, assigneeName });
  }

  if (patch.status && patch.status !== conversation.status) {
    sets.push("status = ?");
    values.push(patch.status);
    if (patch.status === "resolved") {
      sets.push("resolved_at = ?, snoozed_until = NULL");
      values.push(now);
      events.push({ type: "resolved", agentName: agent.name });
    } else if (patch.status === "snoozed") {
      const until = patch.snoozedUntil;
      if (!until || until <= now) throw badRequest("Snooze needs a time in the future");
      sets.push("snoozed_until = ?, resolved_at = NULL");
      values.push(until);
      events.push({ type: "snoozed", agentName: agent.name, until });
    } else {
      sets.push("snoozed_until = NULL, resolved_at = NULL");
      events.push({ type: "reopened", agentName: agent.name });
    }
  }

  if (sets.length === 0) return conversation;
  await env.DB.prepare(`UPDATE conversations SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`)
    .bind(...values, now, conversation.id)
    .run();

  let current = await getConversation(env, conversation.id);
  for (const event of events) {
    ({ conversation: current } = await insertMessage(
      env,
      ctx,
      origin,
      current,
      { type: "system", agent },
      "event",
      { body: "", attachmentIds: [], clientId: null },
      [],
      event,
    ));
  }
  ctx.waitUntil(
    sendWebhook(env, "conversation.updated", {
      conversationId: current.id,
      contactId: current.contact_id,
      status: current.status,
      assigneeId: current.assignee_id,
    }),
  );
  return current;
}

/** Wakes snoozed conversations whose time has come. Run from the cron trigger. */
export async function wakeSnoozed(env: Env, ctx: ExecutionContext, origin: string): Promise<number> {
  const { results } = await env.DB.prepare(
    "SELECT * FROM conversations WHERE status = 'snoozed' AND snoozed_until <= ? LIMIT 200",
  )
    .bind(Date.now())
    .all<ConversationRow>();
  for (const row of results) {
    await env.DB.prepare("UPDATE conversations SET status = 'open', snoozed_until = NULL, updated_at = ? WHERE id = ?")
      .bind(Date.now(), row.id)
      .run();
    await insertMessage(
      env,
      ctx,
      origin,
      await getConversation(env, row.id),
      { type: "system", agent: null },
      "event",
      { body: "", attachmentIds: [], clientId: null },
      [],
      { type: "reopened", agentName: null },
    );
  }
  return results.length;
}

export async function markRead(
  env: Env,
  conversation: ConversationRow,
  by: "contact" | "agent",
): Promise<number> {
  const now = Date.now();
  if (by === "agent") {
    if ((conversation.agent_last_read_at ?? 0) >= (conversation.last_contact_message_at ?? 0)) {
      return conversation.agent_last_read_at ?? now;
    }
    await env.DB.prepare("UPDATE conversations SET agent_last_read_at = ? WHERE id = ?").bind(now, conversation.id).run();
    const updated = await getConversation(env, conversation.id);
    const [agentConversation] = await toAgentConversations(env, [updated]);
    await Promise.all([
      agentConversation ? notifyAgents(env, { type: "conversation.updated", conversation: agentConversation }) : null,
      notifyContact(env, conversation.contact_id, { type: "conversation.read", conversationId: conversation.id, at: now }),
    ]);
    return now;
  }

  if ((conversation.contact_last_read_at ?? 0) >= (conversation.last_agent_message_at ?? 0)) {
    return conversation.contact_last_read_at ?? now;
  }
  await env.DB.prepare("UPDATE conversations SET contact_last_read_at = ? WHERE id = ?").bind(now, conversation.id).run();
  const updated = await getConversation(env, conversation.id);
  const [contactConversation] = await toContactConversations(env, [updated]);
  await Promise.all([
    contactConversation
      ? notifyContact(env, conversation.contact_id, { type: "conversation.updated", conversation: contactConversation })
      : null,
    notifyAgents(env, { type: "conversation.read", conversationId: conversation.id, by: "contact", at: now }),
  ]);
  return now;
}

export async function rateConversation(
  env: Env,
  ctx: ExecutionContext,
  conversation: ConversationRow,
  score: 1 | 2 | 3,
  comment: string | null,
): Promise<ConversationRow> {
  if (conversation.status !== "resolved") throw badRequest("Only resolved conversations can be rated");
  await env.DB.prepare("UPDATE conversations SET rating_score = ?, rating_comment = ?, rating_at = ? WHERE id = ?")
    .bind(score, comment, Date.now(), conversation.id)
    .run();
  const updated = await getConversation(env, conversation.id);
  const [agentConversation] = await toAgentConversations(env, [updated]);
  if (agentConversation) ctx.waitUntil(notifyAgents(env, { type: "conversation.updated", conversation: agentConversation }));
  ctx.waitUntil(sendWebhook(env, "conversation.rated", { conversationId: updated.id, score, comment }));
  return updated;
}

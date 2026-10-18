import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_MESSAGE_LENGTH,
  type Channel,
  type ConversationPriority,
  type ConversationStatus,
  type Message,
  type MessageKind,
  type SystemEvent,
} from "yunidesk";
import type { Env } from "../env";
import { badRequest, notFound } from "../lib/errors";
import { newId } from "../lib/ids";
import { sendPush } from "../lib/push/notify";
import { contactChannel, notifyAgents, notifyContact } from "../lib/realtime";
import { deliverEmailReply } from "../lib/email-channel/outbound";
import { sendWebhook } from "../lib/webhooks";
import { getSettings } from "../lib/settings";
import { sameClosedPeriod, teamAway } from "../lib/business-hours";
import { getAssistant, isAssistantReady } from "../lib/assistant/settings";
import type { WebhookActor, WebhookContactSummary, WebhookConversationLabels } from "yunidesk/webhooks";
import {
  mergeCustomFields,
  parseCustomFields,
  sameCustomFields,
  toConversationField,
  validateCustomFieldsPatch,
} from "../lib/custom-fields";
import type { AgentRow, AttachmentRow, ContactRow, ConversationFieldRow, ConversationRow, MessageRow } from "./rows";
import { loadConversationTags } from "./tags";
import { selectIn } from "./rows";
import { loadAgents, toAgentConversations, toContactConversations, toContactMessage, toMessages } from "./serialize";
import { COUNT_REOPEN_SQL, factsEffect, factsUpdate } from "../lib/reports/conversation-facts";

/** What a contact may see: their and the team's messages, the "resolved", hand-off and away markers. Never notes. */
export const CONTACT_VISIBLE_SQL = `(kind = 'text' OR (kind = 'event' AND json_extract(event, '$.type') IN ('resolved', 'handed_off', 'away')))`;

export function isVisibleToContact(row: Pick<MessageRow, "kind" | "event">): boolean {
  if (row.kind === "text") return true;
  if (row.kind !== "event" || !row.event) return false;
  const type = (JSON.parse(row.event) as SystemEvent).type;
  return type === "resolved" || type === "handed_off" || type === "away";
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

/** How an inbound email message arrived (the email channel). */
export interface InboundEmailMeta {
  messageId: string | null;
  inReplyTo: string | null;
  /** DMARC or aligned DKIM passed. */
  verified: boolean;
}

export interface InsertOptions {
  ai?: boolean;
  email?: InboundEmailMeta;
  /** Written in the same batch as the message (e.g. the email's full text), given the new message id. */
  extraStatements?: (messageId: string) => D1PreparedStatement[];
}

export function actorOf(author: Author): WebhookActor {
  if (author.type === "contact") return { type: "contact", id: author.contactId };
  if (!author.agent) return { type: "system", id: null };
  return { type: author.agent.kind === "bot" ? "bot" : author.type === "system" ? "system" : "agent", id: author.agent.id };
}

async function contactSummary(env: Env, contactId: string): Promise<WebhookContactSummary> {
  const row = await env.DB.prepare("SELECT id, external_id, email, name FROM contacts WHERE id = ?")
    .bind(contactId)
    .first<Pick<ContactRow, "id" | "external_id" | "email" | "name">>();
  return { id: contactId, externalId: row?.external_id ?? null, email: row?.email ?? null, name: row?.name ?? null };
}

/** Priority, tag names, custom fields and team, as conversation webhooks carry them (team only). */
export async function conversationLabels(env: Env, row: ConversationRow): Promise<WebhookConversationLabels> {
  const tags = (await loadConversationTags(env, [row.id])).get(row.id) ?? [];
  const team = row.team_id
    ? await env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(row.team_id).first<{ name: string }>()
    : null;
  return {
    priority: row.priority ?? "normal",
    tags: tags.map((t) => t.name),
    customFields: parseCustomFields(row.custom_fields),
    teamId: team ? row.team_id : null,
    team: team?.name ?? null,
  };
}

async function sendConversationUpdated(env: Env, row: ConversationRow, actor: WebhookActor): Promise<void> {
  await sendWebhook(env, "conversation.updated", {
    conversationId: row.id,
    contactId: row.contact_id,
    actor,
    status: row.status,
    assigneeId: row.assignee_id,
    ...(await conversationLabels(env, row)),
  });
}

/**
 * After a team-only change that writes no timeline event (tags): bumps updated_at, tells the
 * team's dashboards and sends conversation.updated. Contacts are not told: nothing they see changed.
 */
export async function labelsChanged(
  env: Env,
  ctx: ExecutionContext,
  agent: AgentRow,
  conversationId: string,
): Promise<ConversationRow> {
  await env.DB.prepare("UPDATE conversations SET updated_at = MAX(updated_at, ?) WHERE id = ?").bind(Date.now(), conversationId).run();
  const current = await getConversation(env, conversationId);
  const [agentConversation] = await toAgentConversations(env, [current]);
  if (agentConversation) ctx.waitUntil(notifyAgents(env, { type: "conversation.updated", conversation: agentConversation }));
  ctx.waitUntil(sendConversationUpdated(env, current, actorOf({ type: "agent", agent })));
  return current;
}

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
  options: InsertOptions & { subject?: string | null } = {},
): Promise<{ conversation: ConversationRow; message: Message }> {
  const author: Author = { type: "contact", contactId };
  const attachments = await validateDraft(env, author, draft);
  const now = Date.now();
  const id = newId("cnv");
  await env.DB.prepare(
    `INSERT INTO conversations (id, contact_id, status, channel, created_at, updated_at, last_message_at, subject)
     VALUES (?, ?, 'open', ?, ?, ?, ?, ?)`,
  )
    .bind(id, contactId, channel, now, now, now, options.subject ?? null)
    .run();
  const conversation = await getConversation(env, id);
  const { subject: _subject, ...insertOptions } = options;
  const result = await insertMessage(env, ctx, origin, conversation, author, "text", draft, attachments, null, insertOptions);
  ctx.waitUntil(sendPush(env, origin, { kind: "newConversation", conversation: result.conversation, preview: draft.body }));
  ctx.waitUntil(
    contactSummary(env, contactId).then((contact) =>
      sendWebhook(env, "conversation.created", {
        conversationId: id,
        contactId,
        channel,
        contact,
        priority: conversation.priority ?? "normal",
        tags: [],
        customFields: parseCustomFields(conversation.custom_fields),
        // Rules route it right after this event; conversation.updated carries the team.
        teamId: null,
        team: null,
      }),
    ),
  );
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
  options: InsertOptions = {},
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
  const result = await insertMessage(env, ctx, origin, conversation, author, kind, draft, attachments, null, options);
  if (author.type === "contact" && result.conversation.assignee_id) {
    ctx.waitUntil(sendPush(env, origin, { kind: "assignedMessage", conversation: result.conversation, preview: draft.body }));
  }
  return result;
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
  options: InsertOptions = {},
): Promise<{ conversation: ConversationRow; message: Message; delivered: Promise<void> }> {
  const now = Math.max(Date.now(), conversation.updated_at);
  const id = newId("msg");
  const body = draft.body.trim();
  const agent = author.type === "contact" ? null : author.agent;
  // A team reply in an email conversation goes out as an email (notes never do).
  const emailOut = conversation.channel === "email" && kind === "text" && author.type === "agent";
  const emailIn = author.type === "contact" ? (options.email ?? null) : null;
  const email = {
    direction: emailOut ? "outbound" : emailIn ? "inbound" : null,
    messageId: emailIn?.messageId ?? null,
    inReplyTo: emailIn?.inReplyTo ?? null,
    status: emailOut ? "pending" : null,
    nextAttemptAt: emailOut ? now : null,
    verified: emailIn ? (emailIn.verified ? 1 : 0) : null,
  } as const;
  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO messages (id, conversation_id, author_type, agent_id, kind, body, event, client_id, created_at, ai,
         email_direction, email_message_id, email_in_reply_to, email_status, email_next_attempt_at, email_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      options.ai ? 1 : 0,
      email.direction,
      email.messageId,
      email.inReplyTo,
      email.status,
      email.nextAttemptAt,
      email.verified,
    ),
    ...(options.extraStatements?.(id) ?? []),
  ];
  if (attachments.length > 0) {
    statements.push(
      env.DB.prepare(
        `UPDATE attachments SET message_id = ?, conversation_id = ?
         WHERE id IN (${attachments.map(() => "?").join(",")}) AND message_id IS NULL`,
      ).bind(id, conversation.id, ...attachments.map((a) => a.id)),
    );
  }

  let assigneeBeforeIndex = -1;
  if (kind === "text") {
    const preview = body.length > PREVIEW_LENGTH ? `${body.slice(0, PREVIEW_LENGTH - 1)}…` : body;
    const previewSet = `last_message_at = ?, last_message_body = ?, last_message_author = ?,
      last_message_author_name = ?, last_message_attachments = ?, updated_at = ?`;
    const previewValues = [now, preview, author.type, agent?.name ?? null, attachments.length, now];
    if (author.type === "contact") {
      statements.push(
        env.DB.prepare(
          `UPDATE conversations SET ${previewSet}, last_contact_message_at = ?, contact_last_read_at = ?,
             ${COUNT_REOPEN_SQL}, status = 'open', snoozed_until = NULL, resolved_at = NULL
           WHERE id = ?`,
        ).bind(...previewValues, now, now, conversation.id),
      );
    } else {
      // Read inside the same transaction, to know whether this reply is what assigned it.
      assigneeBeforeIndex = statements.length;
      statements.push(env.DB.prepare("SELECT assignee_id FROM conversations WHERE id = ?").bind(conversation.id));
      statements.push(
        env.DB.prepare(
          `UPDATE conversations SET ${previewSet}, last_agent_message_at = ?, agent_last_read_at = ?,
             assignee_id = COALESCE(assignee_id, ?),
             -- A teammate answering takes the conversation over from the AI assistant.
             ai_state = CASE WHEN ? = 1 AND ai_state = 'active' THEN 'human' ELSE ai_state END
           WHERE id = ?`,
        ).bind(
          ...previewValues,
          now,
          now,
          agent && agent.kind === "human" ? agent.id : null,
          agent && agent.kind === "human" ? 1 : 0,
          conversation.id,
        ),
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
  // Report facts (first response, AI involvement): see lib/reports/conversation-facts.ts.
  const facts = factsUpdate(
    factsEffect({ authorType: author.type, agentKind: agent?.kind ?? null, kind, ai: options.ai === true, event }),
    conversation.id,
    now,
  );
  if (facts) statements.push(env.DB.prepare(facts.sql).bind(...facts.values));

  let batchResults: D1Result[];
  try {
    batchResults = await env.DB.batch(statements);
  } catch (error) {
    // Two retries of the same send raced; return the one that won.
    if (draft.clientId && String(error).includes("UNIQUE")) {
      const existing = await env.DB.prepare("SELECT * FROM messages WHERE conversation_id = ? AND client_id = ?")
        .bind(conversation.id, draft.clientId)
        .first<MessageRow>();
      if (existing && sameAuthor(existing, author)) {
        const [message] = await toMessages(env, origin, [existing]);
        return { conversation, message: message!, delivered: Promise.resolve() };
      }
    }
    throw error;
  }

  let updated = await getConversation(env, conversation.id);
  const assigneeBefore =
    assigneeBeforeIndex === -1 ? undefined : (batchResults[assigneeBeforeIndex]?.results[0] as { assignee_id: string | null } | undefined);
  if (assigneeBefore && assigneeBefore.assignee_id === null && updated.assignee_id !== null && agent) {
    updated = await assignmentChanged(env, ctx, origin, updated, {
      to: updated.assignee_id,
      assigneeName: agent.name,
      source: { type: "first_reply", agent },
    });
  }
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
    ai: options.ai ? 1 : 0,
    email_direction: email.direction,
    email_message_id: email.messageId,
    email_in_reply_to: email.inReplyTo,
    email_status: email.status,
    email_error: null,
    email_attempts: 0,
    email_next_attempt_at: email.nextAttemptAt,
    email_verified: email.verified,
  };
  const agents = await loadAgents(env);
  const [message] = await toMessages(env, origin, [row], agents);

  const delivered = broadcastMessage(env, updated, message!, row, agents).catch((error: unknown) =>
    console.warn("message broadcast failed", error instanceof Error ? error.message : String(error)),
  );
  ctx.waitUntil(delivered);
  if (kind === "text") {
    ctx.waitUntil(
      contactSummary(env, conversation.contact_id).then((contact) =>
        sendWebhook(env, "message.created", {
          conversationId: conversation.id,
          contactId: conversation.contact_id,
          actor: actorOf(author),
          contact,
          message: { id, authorType: author.type, agentId: agent?.id ?? null, body, attachmentCount: attachments.length, createdAt: now },
        }),
      ),
    );
    if (author.type === "agent") ctx.waitUntil(contactChannel(env, conversation.contact_id).scheduleUnreadCheck());
  }
  if (emailOut) ctx.waitUntil(deliverEmailReply(env, ctx, origin, id));
  return { conversation: updated, message: message!, delivered };
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
            ? { type: "message.created", message: toContactMessage(message), conversation: contactConversation }
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
  priority?: ConversationPriority;
  /** `{ key: value | null }`, merged into the stored values (null clears). Checked against the field definitions. */
  customFields?: Record<string, unknown>;
  /** Moves it to a team (null: out of its team). Doesn't change the assignee. */
  teamId?: string | null;
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
  let assignment: AssignmentChange | null = null;

  if (patch.assigneeId !== undefined && patch.assigneeId !== conversation.assignee_id) {
    let assigneeName: string | null = null;
    if (patch.assigneeId) {
      const assignee = await env.DB.prepare("SELECT * FROM agents WHERE id = ? AND disabled_at IS NULL AND kind = 'human'")
        .bind(patch.assigneeId)
        .first<AgentRow>();
      if (!assignee) throw badRequest("Unknown teammate");
      assigneeName = assignee.name;
    }
    sets.push("assignee_id = ?");
    values.push(patch.assigneeId);
    assignment = { to: patch.assigneeId, assigneeName, source: { type: "teammate", agent } };
  }

  if (patch.teamId !== undefined && patch.teamId !== conversation.team_id) {
    let teamName: string | null = null;
    if (patch.teamId) {
      const team = await env.DB.prepare("SELECT name FROM teams WHERE id = ?").bind(patch.teamId).first<{ name: string }>();
      if (!team) throw badRequest("Unknown team");
      teamName = team.name;
    }
    sets.push("team_id = ?");
    values.push(patch.teamId);
    events.push({ type: "team", agentName: agent.name, teamName });
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
      sets.push(`snoozed_until = ?, resolved_at = NULL, ${COUNT_REOPEN_SQL}`);
      values.push(until);
      events.push({ type: "snoozed", agentName: agent.name, until });
    } else {
      sets.push(`snoozed_until = NULL, resolved_at = NULL, ${COUNT_REOPEN_SQL}`);
      events.push({ type: "reopened", agentName: agent.name });
    }
  }

  if (patch.priority && patch.priority !== (conversation.priority ?? "normal")) {
    sets.push("priority = ?");
    values.push(patch.priority);
    events.push({ type: "priority", agentName: agent.name, priority: patch.priority });
  }

  if (patch.customFields !== undefined) {
    const { results } = await env.DB.prepare("SELECT * FROM conversation_fields").all<ConversationFieldRow>();
    const checked = validateCustomFieldsPatch(results.map(toConversationField), patch.customFields);
    if (!checked.ok) throw badRequest(checked.error, "invalid_custom_fields");
    const current = parseCustomFields(conversation.custom_fields);
    if (!sameCustomFields(current, mergeCustomFields(current, checked.value))) {
      // json_patch merges in SQL, so two teammates editing different fields at once both win.
      sets.push("custom_fields = json_patch(custom_fields, ?)");
      values.push(JSON.stringify(checked.value));
    }
  }

  if (sets.length === 0) return conversation;
  await env.DB.prepare(`UPDATE conversations SET ${sets.join(", ")}, updated_at = ? WHERE id = ?`)
    .bind(...values, now, conversation.id)
    .run();

  let current = await getConversation(env, conversation.id);
  if (assignment) current = await assignmentChanged(env, ctx, origin, current, assignment);
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
  if (events.length === 0 && !assignment) {
    // Only custom fields changed: no timeline event carried the new state to the dashboards.
    const [agentConversation] = await toAgentConversations(env, [current]);
    if (agentConversation) ctx.waitUntil(notifyAgents(env, { type: "conversation.updated", conversation: agentConversation }));
  }
  ctx.waitUntil(sendConversationUpdated(env, current, actorOf({ type: "agent", agent })));
  return current;
}

export type AssignmentSource =
  /** A teammate or an API key's bot (PATCH assigneeId). */
  | { type: "teammate"; agent: AgentRow }
  /** The automatic assignment rules. */
  | { type: "rules" }
  /** A teammate's first reply took an unassigned conversation. */
  | { type: "first_reply"; agent: AgentRow };

export interface AssignmentChange {
  to: string | null;
  assigneeName: string | null;
  source: AssignmentSource;
}

/**
 * Every change of assignee goes through here exactly once, after the row is written, whatever
 * made it: a teammate or a key (PATCH), the assignment rules, or a first reply. Writes the timeline
 * event and sends the "assigned to you" push (not for a first reply: the replier took it themselves).
 */
async function assignmentChanged(
  env: Env,
  ctx: ExecutionContext,
  origin: string,
  conversation: ConversationRow,
  change: AssignmentChange,
): Promise<ConversationRow> {
  if (change.source.type === "first_reply") return conversation;
  const actor = change.source.type === "teammate" ? { id: change.source.agent.id, name: change.source.agent.name } : { id: null, name: null };
  const { conversation: current } = await insertMessage(
    env,
    ctx,
    origin,
    conversation,
    { type: "system", agent: change.source.type === "teammate" ? change.source.agent : null },
    "event",
    { body: "", attachmentIds: [], clientId: null },
    [],
    { type: "assigned", agentName: actor.name, assigneeName: change.assigneeName },
  );
  if (current.assignee_id) ctx.waitUntil(sendPush(env, origin, { kind: "assigned", conversation: current, actor }));
  return current;
}

/**
 * After the assignment rules routed a conversation (db/routing.ts wrote team and assignee):
 * the team event, the assignment, and conversation.updated with a system actor.
 */
export async function announceRouting(
  env: Env,
  ctx: ExecutionContext,
  origin: string,
  conversationId: string,
  team: { name: string },
  assigneeId: string | null,
): Promise<ConversationRow> {
  let current = await getConversation(env, conversationId);
  ({ conversation: current } = await insertMessage(
    env,
    ctx,
    origin,
    current,
    { type: "system", agent: null },
    "event",
    { body: "", attachmentIds: [], clientId: null },
    [],
    { type: "team", agentName: null, teamName: team.name },
  ));
  if (assigneeId) {
    const assignee = await env.DB.prepare("SELECT name FROM agents WHERE id = ?").bind(assigneeId).first<{ name: string }>();
    current = await assignmentChanged(env, ctx, origin, current, {
      to: assigneeId,
      assigneeName: assignee?.name ?? null,
      source: { type: "rules" },
    });
  }
  ctx.waitUntil(sendConversationUpdated(env, current, { type: "system", id: null }));
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

/** A reply written by the AI assistant, as its bot teammate. */
export async function postAssistantMessage(
  env: Env,
  ctx: ExecutionContext,
  origin: string,
  conversation: ConversationRow,
  agent: AgentRow,
  body: string,
): Promise<{ conversation: ConversationRow; message: Message; delivered: Promise<void> }> {
  return insertMessage(
    env,
    ctx,
    origin,
    conversation,
    { type: "agent", agent },
    "text",
    { body, attachmentIds: [], clientId: null },
    [],
    null,
    { ai: true },
  );
}

/** "Talk to a human": the assistant stops and the team sees a marker. Use handOffAndRoute (db/routing.ts) so the rules run. */
export async function handOffToTeam(
  env: Env,
  ctx: ExecutionContext,
  origin: string,
  conversation: ConversationRow,
): Promise<ConversationRow> {
  const now = Date.now();
  // Outside business hours the marker says when the team is back, and counts as the away message.
  const away = teamAway((await getSettings(env)).businessHours, now);
  const changed = await env.DB.prepare(
    `UPDATE conversations SET ai_state = 'handed_off', ai_lock_until = NULL, ${COUNT_REOPEN_SQL}, status = 'open', updated_at = ?,
       away_notified_at = CASE WHEN ? THEN ? ELSE away_notified_at END
     WHERE id = ? AND ai_state = 'active'`,
  )
    .bind(now, away ? 1 : 0, now, conversation.id)
    .run();
  const current = await getConversation(env, conversation.id);
  if (!changed.meta.changes) return current;
  const { conversation: updated } = await insertMessage(
    env,
    ctx,
    origin,
    current,
    { type: "system", agent: null },
    "event",
    { body: "", attachmentIds: [], clientId: null },
    [],
    away?.backAt ? { type: "handed_off", agentName: null, backAt: away.backAt } : { type: "handed_off", agentName: null },
  );
  ctx.waitUntil(sendPush(env, origin, { kind: "handoff", conversation: updated }));
  ctx.waitUntil(sendConversationUpdated(env, updated, { type: "contact", id: updated.contact_id }));
  return updated;
}

/**
 * Outside business hours, a customer writing to the team (not to the assistant) gets the away
 * message once per closed period. The claim on `away_notified_at` makes two messages sent at the
 * same time post it once.
 */
export async function postAwayMessage(
  env: Env,
  ctx: ExecutionContext,
  origin: string,
  conversationId: string,
  /** The customer is signed in (the assistant may skip anonymous visitors). */
  identified: boolean,
): Promise<void> {
  const settings = await getSettings(env);
  const now = Date.now();
  const away = teamAway(settings.businessHours, now);
  if (!away) return;
  const conversation = await getConversation(env, conversationId);
  if (conversation.last_message_author !== "contact") return;
  if (sameClosedPeriod(settings.businessHours, conversation.away_notified_at, now)) return;
  // Someone on the team already answered since closing: they're here, don't say they're away.
  if (sameClosedPeriod(settings.businessHours, conversation.last_agent_message_at, now)) return;
  // The assistant answers this one; if it hands off, its marker says when the team is back.
  const assistant = await getAssistant(env);
  const assistantTakesIt =
    isAssistantReady(assistant) &&
    (conversation.ai_state === null || conversation.ai_state === "active") &&
    (identified || assistant.allowAnonymous);
  if (assistantTakesIt) return;
  const claimed = await env.DB.prepare("UPDATE conversations SET away_notified_at = ? WHERE id = ? AND away_notified_at IS ?")
    .bind(now, conversation.id, conversation.away_notified_at)
    .run();
  if (!claimed.meta.changes) return;
  await insertMessage(
    env,
    ctx,
    origin,
    await getConversation(env, conversation.id),
    { type: "system", agent: null },
    "event",
    { body: "", attachmentIds: [], clientId: null },
    [],
    { type: "away", agentName: null, message: settings.awayMessage, backAt: away.backAt },
  );
}

/** A team-only marker in the timeline (e.g. an email that could not be delivered). */
export async function postSystemEvent(
  env: Env,
  ctx: ExecutionContext,
  origin: string,
  conversation: ConversationRow,
  event: SystemEvent,
): Promise<ConversationRow> {
  const { conversation: updated } = await insertMessage(
    env,
    ctx,
    origin,
    conversation,
    { type: "system", agent: null },
    "event",
    { body: "", attachmentIds: [], clientId: null },
    [],
    event,
  );
  return updated;
}

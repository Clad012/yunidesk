import { Hono } from "hono";
import { z } from "zod";
import { CONVERSATION_PRIORITIES, type AgentConversation, type InboxCounts, type Page } from "yunidesk";
import { limit, publicOrigin, readBody, type AppContext, type AppEnv } from "../../app-env";
import { getConversation, markRead, postMessage, updateConversation } from "../../db/conversations";
import type { ConversationRow, MessageRow } from "../../db/rows";
import { loadAgents, toAgentConversations, toAttachment, toMessages } from "../../db/serialize";
import { badRequest } from "../../lib/errors";
import { inboxHub } from "../../lib/realtime";
import { storeUpload } from "../../lib/uploads";

const viewSchema = z.enum(["mine", "unassigned", "open", "snoozed", "resolved", "all"]);
const draftSchema = z.object({
  body: z.string().max(5000).default(""),
  kind: z.enum(["text", "note"]).default("text"),
  attachmentIds: z.array(z.string().max(64)).max(5).default([]),
  clientId: z.string().min(8).max(64),
});
const patchSchema = z.object({
  status: z.enum(["open", "snoozed", "resolved"]).optional(),
  snoozedUntil: z.number().int().positive().nullish(),
  assigneeId: z.string().max(64).nullish(),
  priority: z.enum(CONVERSATION_PRIORITIES).optional(),
  customFields: z.record(z.string().max(64), z.unknown()).optional(),
});
const prioritySchema = z.enum(CONVERSATION_PRIORITIES);

/** urgent > high > normal > low, for ?sort=priority. */
const PRIORITY_RANK_SQL = `(CASE priority WHEN 'urgent' THEN 3 WHEN 'high' THEN 2 WHEN 'normal' THEN 1 ELSE 0 END)`;
const PRIORITY_RANK: Record<string, number> = { urgent: 3, high: 2, normal: 1, low: 0 };

const PAGE_SIZE = 30;
const MESSAGE_PAGE_SIZE = 50;

export const inboxRoutes = new Hono<AppEnv>();

/** Turns free text into a safe FTS5 prefix query: every word quoted, all must match. */
export function ftsQuery(input: string): string | null {
  const words = input
    .split(/\s+/)
    .map((w) => w.replace(/"/g, "").trim())
    .filter(Boolean)
    .slice(0, 8);
  return words.length ? words.map((w) => `"${w}"*`).join(" ") : null;
}

export async function withOnline(c: AppContext, rows: ConversationRow[]): Promise<AgentConversation[]> {
  let online = new Set<string>();
  try {
    online = new Set(await inboxHub(c.env).onlineContacts([...new Set(rows.map((r) => r.contact_id))]));
  } catch (error) {
    console.warn("presence lookup failed", error);
  }
  return toAgentConversations(c.env, rows, { onlineContactIds: online });
}

inboxRoutes.get("/counts", async (c) => {
  const agent = c.get("agent");
  const row = await c.env.DB.prepare(
    `SELECT
       COALESCE(SUM(status = 'open' AND assignee_id = ?), 0) AS mine,
       COALESCE(SUM(status = 'open' AND assignee_id IS NULL), 0) AS unassigned,
       COALESCE(SUM(status = 'open'), 0) AS open,
       COALESCE(SUM(status = 'snoozed'), 0) AS snoozed
     FROM conversations`,
  )
    .bind(agent.id)
    .first<InboxCounts>();
  return c.json(row);
});

inboxRoutes.get("/", async (c) => {
  const agent = c.get("agent");
  const view = viewSchema.catch("open").parse(c.req.query("view") ?? "open");
  const where: string[] = [];
  const values: unknown[] = [];

  if (view === "mine") where.push("status = 'open' AND assignee_id = ?"), values.push(agent.id);
  else if (view === "unassigned") where.push("status = 'open' AND assignee_id IS NULL");
  else if (view !== "all") where.push("status = ?"), values.push(view);

  const contactId = c.req.query("contactId");
  if (contactId) where.push("contact_id = ?"), values.push(contactId);

  const q = (c.req.query("q") ?? "").trim().slice(0, 200);
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const fts = ftsQuery(q);
    where.push(
      `(contact_id IN (SELECT id FROM contacts WHERE name LIKE ? OR email LIKE ? OR external_id = ?)` +
        (fts
          ? ` OR id IN (SELECT m.conversation_id FROM messages m WHERE m.rowid IN
                (SELECT rowid FROM messages_fts WHERE messages_fts MATCH ? LIMIT 500))`
          : "") +
        ")",
    );
    values.push(like, like, q);
    if (fts) values.push(fts);
  }

  const tag = c.req.query("tag");
  if (tag) where.push("id IN (SELECT conversation_id FROM conversation_tags WHERE tag_id = ?)"), values.push(tag);

  const priority = c.req.query("priority");
  if (priority) {
    const parsed = prioritySchema.safeParse(priority);
    if (!parsed.success) throw badRequest("priority must be low, normal, high or urgent");
    where.push("priority = ?"), values.push(parsed.data);
  }

  // Default: newest activity first. sort=priority: urgent first, then high…, newest first within each.
  const byPriority = c.req.query("sort") === "priority";
  const cursor = c.req.query("cursor");
  if (cursor) {
    const parts = cursor.split("_");
    const [rank, at, id] = byPriority ? parts : [null, ...parts];
    if (!at || !id || !/^\d+$/.test(at) || (byPriority && !/^[0-3]$/.test(rank ?? ""))) throw badRequest("Bad cursor");
    const after = "(last_message_at < ? OR (last_message_at = ? AND id < ?))";
    if (byPriority) {
      where.push(`(${PRIORITY_RANK_SQL} < ? OR (${PRIORITY_RANK_SQL} = ? AND ${after}))`);
      values.push(Number(rank), Number(rank));
    } else {
      where.push(after);
    }
    values.push(Number(at), Number(at), `cnv_${id}`);
  }

  const { results } = await c.env.DB.prepare(
    `SELECT * FROM conversations ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY ${byPriority ? `${PRIORITY_RANK_SQL} DESC, ` : ""}last_message_at DESC, id DESC LIMIT ?`,
  )
    .bind(...values, PAGE_SIZE + 1)
    .all<ConversationRow>();
  const page = results.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  const nextCursor =
    results.length > PAGE_SIZE && last
      ? `${byPriority ? `${PRIORITY_RANK[last.priority] ?? 1}_` : ""}${last.last_message_at}_${last.id.slice(4)}`
      : null;
  return c.json<Page<AgentConversation>>({ items: await withOnline(c, page), nextCursor });
});

inboxRoutes.get("/:id", async (c) => {
  const [conversation] = await withOnline(c, [await getConversation(c.env, c.req.param("id"))]);
  return c.json(conversation);
});

inboxRoutes.get("/:id/messages", async (c) => {
  const conversation = await getConversation(c.env, c.req.param("id"));
  const before = c.req.query("before");
  let cursor: MessageRow | null = null;
  if (before) {
    cursor = await c.env.DB.prepare("SELECT * FROM messages WHERE id = ? AND conversation_id = ?")
      .bind(before, conversation.id)
      .first<MessageRow>();
    if (!cursor) throw badRequest("Unknown cursor");
  }
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM messages WHERE conversation_id = ?
       ${cursor ? "AND (created_at < ? OR (created_at = ? AND id < ?))" : ""}
     ORDER BY created_at DESC, id DESC LIMIT ?`,
  )
    .bind(conversation.id, ...(cursor ? [cursor.created_at, cursor.created_at, cursor.id] : []), MESSAGE_PAGE_SIZE + 1)
    .all<MessageRow>();
  const page = results.slice(0, MESSAGE_PAGE_SIZE).reverse();
  return c.json({
    items: await toMessages(c.env, publicOrigin(c), page, await loadAgents(c.env)),
    nextCursor: results.length > MESSAGE_PAGE_SIZE ? (page[0]?.id ?? null) : null,
  });
});

inboxRoutes.post("/:id/messages", async (c) => {
  const agent = c.get("agent");
  await limit(c.env.WRITE_LIMITER, `agent:${agent.id}`);
  const conversation = await getConversation(c.env, c.req.param("id"));
  const { kind, ...draft } = await readBody(c, draftSchema);
  const result = await postMessage(
    c.env,
    c.executionCtx as ExecutionContext,
    publicOrigin(c),
    conversation,
    { type: "agent", agent },
    kind,
    draft,
  );
  const [updated] = await withOnline(c, [result.conversation]);
  return c.json({ conversation: updated, message: result.message }, 201);
});

inboxRoutes.patch("/:id", async (c) => {
  const conversation = await getConversation(c.env, c.req.param("id"));
  const patch = await readBody(c, patchSchema);
  const updated = await updateConversation(
    c.env,
    c.executionCtx as ExecutionContext,
    publicOrigin(c),
    c.get("agent"),
    conversation,
    {
      status: patch.status,
      snoozedUntil: patch.snoozedUntil ?? null,
      assigneeId: patch.assigneeId === undefined ? undefined : patch.assigneeId,
      priority: patch.priority,
      customFields: patch.customFields,
    },
  );
  const [result] = await withOnline(c, [updated]);
  return c.json(result);
});

inboxRoutes.post("/:id/read", async (c) => {
  const at = await markRead(c.env, await getConversation(c.env, c.req.param("id")), "agent");
  return c.json({ at });
});

export const attachmentRoutes = new Hono<AppEnv>();

attachmentRoutes.post("/", async (c) => {
  const agent = c.get("agent");
  await limit(c.env.WRITE_LIMITER, `upload:${agent.id}`);
  const row = await storeUpload(c.env, await c.req.formData(), { type: "agent", id: agent.id });
  return c.json(await toAttachment(c.env, publicOrigin(c), row), 201);
});

import { Hono } from "hono";
import type { Contact, Page } from "yunidesk";
import { publicOrigin, type AppEnv } from "../../app-env";
import type { AttachmentRow, ContactRow, ConversationRow, MessageRow } from "../../db/rows";
import { toContact, toMessages } from "../../db/serialize";
import { badRequest, notFound } from "../../lib/errors";
import { requireOwner } from "../../lib/agent-session";
import { contactChannel, inboxHub, notifyAgents } from "../../lib/realtime";
import { deleteObjects } from "../../lib/uploads";
import { CONTACT_VISIBLE_SQL } from "../../db/conversations";
import { withOnline } from "./inbox";

const PAGE_SIZE = 40;

export const contactAdminRoutes = new Hono<AppEnv>();

async function findContact(db: D1Database, id: string): Promise<ContactRow> {
  const row = await db.prepare("SELECT * FROM contacts WHERE id = ?").bind(id).first<ContactRow>();
  if (!row) throw notFound("Contact not found");
  return row;
}

async function onlineSet(env: AppEnv["Bindings"], ids: string[]): Promise<Set<string>> {
  try {
    return new Set(await inboxHub(env).onlineContacts(ids));
  } catch {
    return new Set();
  }
}

contactAdminRoutes.get("/", async (c) => {
  const q = (c.req.query("q") ?? "").trim().slice(0, 200);
  const where = ["EXISTS (SELECT 1 FROM conversations WHERE contact_id = contacts.id)"];
  const values: unknown[] = [];
  if (q) {
    const like = `%${q.replace(/[%_]/g, "")}%`;
    where.push("(name LIKE ? OR email LIKE ? OR external_id = ?)");
    values.push(like, like, q);
  }
  const cursor = c.req.query("cursor");
  if (cursor) {
    const [at, id] = cursor.split("~");
    if (!at || !id || !/^\d+$/.test(at)) throw badRequest("Bad cursor");
    where.push("(COALESCE(last_seen_at, created_at) < ? OR (COALESCE(last_seen_at, created_at) = ? AND id < ?))");
    values.push(Number(at), Number(at), id);
  }
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM contacts WHERE ${where.join(" AND ")}
     ORDER BY COALESCE(last_seen_at, created_at) DESC, id DESC LIMIT ?`,
  )
    .bind(...values, PAGE_SIZE + 1)
    .all<ContactRow>();
  const page = results.slice(0, PAGE_SIZE);
  const online = await onlineSet(c.env, page.map((r) => r.id));
  const last = page[page.length - 1];
  return c.json<Page<Contact>>({
    items: page.map((row) => toContact(row, online.has(row.id))),
    nextCursor: results.length > PAGE_SIZE && last ? `${last.last_seen_at ?? last.created_at}~${last.id}` : null,
  });
});

contactAdminRoutes.get("/:id", async (c) => {
  const contact = await findContact(c.env.DB, c.req.param("id"));
  const { results } = await c.env.DB.prepare(
    "SELECT * FROM conversations WHERE contact_id = ? ORDER BY last_message_at DESC LIMIT 50",
  )
    .bind(contact.id)
    .all<ConversationRow>();
  const online = await onlineSet(c.env, [contact.id]);
  return c.json({ contact: toContact(contact, online.has(contact.id)), conversations: await withOnline(c, results) });
});

/** Right of access / portability (GDPR art. 15 and 20): everything we hold about one contact. */
contactAdminRoutes.get("/:id/export", async (c) => {
  const contact = await findContact(c.env.DB, c.req.param("id"));
  const { results: conversations } = await c.env.DB.prepare(
    "SELECT * FROM conversations WHERE contact_id = ? ORDER BY created_at",
  )
    .bind(contact.id)
    .all<ConversationRow>();
  const exported = [];
  for (const conversation of conversations) {
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM messages WHERE conversation_id = ? AND ${CONTACT_VISIBLE_SQL} ORDER BY created_at`,
    )
      .bind(conversation.id)
      .all<MessageRow>();
    const messages = await toMessages(c.env, publicOrigin(c), results);
    exported.push({
      id: conversation.id,
      status: conversation.status,
      channel: conversation.channel,
      createdAt: new Date(conversation.created_at).toISOString(),
      rating: conversation.rating_score ? { score: conversation.rating_score, comment: conversation.rating_comment } : null,
      messages: messages.map((m) => ({
        at: new Date(m.createdAt).toISOString(),
        from: m.authorType === "contact" ? "you" : m.authorType === "agent" ? (m.agent?.name ?? "team") : "system",
        text: m.body,
        event: m.event?.type ?? null,
        attachments: m.attachments.map((a) => ({ name: a.fileName, type: a.contentType, size: a.size, url: a.url })),
      })),
    });
  }
  const profile = toContact(contact);
  const body = JSON.stringify(
    { exportedAt: new Date().toISOString(), contact: { ...profile, online: undefined }, conversations: exported },
    null,
    2,
  );
  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="contact-${contact.id}.json"`,
      "cache-control": "no-store",
    },
  });
});

/** Right to erasure (GDPR art. 17): the contact, their conversations, messages and files. */
contactAdminRoutes.delete("/:id", async (c) => {
  requireOwner(c.get("agent"));
  const contact = await findContact(c.env.DB, c.req.param("id"));
  const { results: files } = await c.env.DB.prepare(
    `SELECT r2_key FROM attachments
     WHERE (uploader_type = 'contact' AND uploader_id = ?)
        OR conversation_id IN (SELECT id FROM conversations WHERE contact_id = ?)`,
  )
    .bind(contact.id, contact.id)
    .all<Pick<AttachmentRow, "r2_key">>();
  await deleteObjects(c.env, files.map((f) => f.r2_key));
  await c.env.DB.batch([
    c.env.DB.prepare(
      `DELETE FROM attachments WHERE (uploader_type = 'contact' AND uploader_id = ?)
         OR conversation_id IN (SELECT id FROM conversations WHERE contact_id = ?)`,
    ).bind(contact.id, contact.id),
    // Explicit rather than relying on ON DELETE CASCADE, so the FTS trigger sees every row.
    c.env.DB.prepare(
      "DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE contact_id = ?)",
    ).bind(contact.id),
    c.env.DB.prepare("DELETE FROM conversations WHERE contact_id = ?").bind(contact.id),
    c.env.DB.prepare("DELETE FROM contacts WHERE id = ?").bind(contact.id),
    // Queued and logged webhook payloads can carry their messages too.
    c.env.DB.prepare("DELETE FROM webhook_deliveries WHERE contact_id = ?").bind(contact.id),
  ]);
  // Rewrites the search index so the erased words don't linger in old index segments.
  await c.env.DB.prepare("INSERT INTO messages_fts(messages_fts) VALUES('optimize')").run();
  c.executionCtx.waitUntil(
    Promise.all([
      contactChannel(c.env, contact.id).disconnectAll(),
      inboxHub(c.env).setContactOnline(contact.id, false),
      notifyAgents(c.env, { type: "contact.deleted", contactId: contact.id }),
    ]),
  );
  return c.json({ ok: true, deletedFiles: files.length });
});

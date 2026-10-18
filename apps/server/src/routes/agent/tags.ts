import { Hono } from "hono";
import { z } from "zod";
import { MAX_TAGS_PER_CONVERSATION, TAG_COLORS, type Tag, type TagWithUsage } from "yunidesk";
import { limit, readBody, type AppEnv } from "../../app-env";
import { getConversation, labelsChanged } from "../../db/conversations";
import type { TagRow } from "../../db/rows";
import { normalizeTagName, toTag } from "../../db/tags";
import { requirePermission } from "../../lib/permissions";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { withOnline } from "./inbox";

/** Plenty for labelling; keeps the views pane and pickers usable. */
const MAX_TAGS = 500;

const nameSchema = z.string().max(200).transform((value, ctx) => {
  const name = normalizeTagName(value);
  if (!name) ctx.addIssue({ code: "custom", message: "Use 1 to 40 characters" });
  return name ?? "";
});
const colorSchema = z.enum(TAG_COLORS);
const createSchema = z.object({ name: nameSchema, color: colorSchema.default("gray") });
const patchSchema = z.object({ name: nameSchema.optional(), color: colorSchema.optional() });
/** Add an existing tag by id, or by name (created when missing: integrations can tag in one call). */
const attachSchema = z
  .object({ tagId: z.string().max(64).optional(), name: nameSchema.optional(), color: colorSchema.optional() })
  .refine((v) => (v.tagId === undefined) !== (v.name === undefined), "Send either tagId or name");

type UsageRow = TagRow & { conversation_count: number; open_count: number };

const toUsage = (row: UsageRow): TagWithUsage => ({
  ...toTag(row),
  conversationCount: row.conversation_count,
  openCount: row.open_count,
  createdAt: row.created_at,
});

async function insertTag(db: D1Database, name: string, color: Tag["color"]): Promise<TagRow> {
  const count = await db.prepare("SELECT COUNT(*) AS n FROM tags").first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_TAGS) throw badRequest(`Up to ${MAX_TAGS} tags`);
  const row: TagRow = { id: newId("tag"), name, color, created_at: Date.now() };
  try {
    await db.prepare("INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)").bind(row.id, name, color, row.created_at).run();
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw conflict("A tag with this name already exists");
    throw error;
  }
  return row;
}

// ---- /tags: the list (with usage), create (any teammate), rename/recolour/delete (owners) ----

export const tagRoutes = new Hono<AppEnv>();

tagRoutes.get("/", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT t.*, COUNT(c.id) AS conversation_count, COALESCE(SUM(c.status = 'open'), 0) AS open_count
     FROM tags t
     LEFT JOIN conversation_tags ct ON ct.tag_id = t.id
     LEFT JOIN conversations c ON c.id = ct.conversation_id
     GROUP BY t.id
     ORDER BY t.name COLLATE NOCASE`,
  ).all<UsageRow>();
  return c.json({ items: results.map(toUsage) });
});

tagRoutes.post("/", async (c) => {
  requirePermission(c, "inbox.update");
  await limit(c.env.WRITE_LIMITER, `agent:${c.get("agent").id}`);
  const input = await readBody(c, createSchema);
  const row = await insertTag(c.env.DB, input.name, input.color);
  return c.json<TagWithUsage>({ ...toTag(row), conversationCount: 0, openCount: 0, createdAt: row.created_at }, 201);
});

tagRoutes.patch("/:id", async (c) => {
  requirePermission(c, "settings.manage");
  const input = await readBody(c, patchSchema);
  const sets: string[] = [];
  const values: unknown[] = [];
  if (input.name !== undefined) sets.push("name = ?"), values.push(input.name);
  if (input.color !== undefined) sets.push("color = ?"), values.push(input.color);
  let row: TagRow | null;
  try {
    row = sets.length
      ? await c.env.DB.prepare(`UPDATE tags SET ${sets.join(", ")} WHERE id = ? RETURNING *`).bind(...values, c.req.param("id")).first<TagRow>()
      : await c.env.DB.prepare("SELECT * FROM tags WHERE id = ?").bind(c.req.param("id")).first<TagRow>();
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw conflict("A tag with this name already exists");
    throw error;
  }
  if (!row) throw notFound("Tag not found");
  return c.json(toTag(row));
});

tagRoutes.delete("/:id", async (c) => {
  requirePermission(c, "settings.manage");
  // conversation_tags rows go with it (ON DELETE CASCADE).
  await c.env.DB.prepare("DELETE FROM tags WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

// ---- /conversations/:id/tags: tag and untag (no timeline event, too noisy) ----

export const conversationTagRoutes = new Hono<AppEnv>();

conversationTagRoutes.post("/:id/tags", async (c) => {
  requirePermission(c, "inbox.update");
  const agent = c.get("agent");
  await limit(c.env.WRITE_LIMITER, `agent:${agent.id}`);
  const conversation = await getConversation(c.env, c.req.param("id"));
  const input = await readBody(c, attachSchema);

  let tag: TagRow | null;
  if (input.tagId !== undefined) {
    tag = await c.env.DB.prepare("SELECT * FROM tags WHERE id = ?").bind(input.tagId).first<TagRow>();
    if (!tag) throw notFound("Tag not found");
  } else {
    const name = input.name!;
    tag = await c.env.DB.prepare("SELECT * FROM tags WHERE name = ?").bind(name).first<TagRow>();
    if (!tag) {
      try {
        tag = await insertTag(c.env.DB, name, input.color ?? "gray");
      } catch (error) {
        // Someone created it a moment ago.
        tag = await c.env.DB.prepare("SELECT * FROM tags WHERE name = ?").bind(name).first<TagRow>();
        if (!tag) throw error;
      }
    }
  }

  // Insert only while under the cap, in one statement, so parallel calls can't overshoot it.
  const inserted = await c.env.DB.prepare(
    `INSERT OR IGNORE INTO conversation_tags (conversation_id, tag_id, created_at)
     SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM conversation_tags WHERE conversation_id = ?) < ?`,
  )
    .bind(conversation.id, tag.id, Date.now(), conversation.id, MAX_TAGS_PER_CONVERSATION)
    .run();
  if (!inserted.meta.changes) {
    const already = await c.env.DB.prepare("SELECT 1 FROM conversation_tags WHERE conversation_id = ? AND tag_id = ?")
      .bind(conversation.id, tag.id)
      .first();
    if (!already) throw badRequest(`Up to ${MAX_TAGS_PER_CONVERSATION} tags per conversation`);
    const [unchanged] = await withOnline(c, [conversation]);
    return c.json(unchanged);
  }
  const updated = await labelsChanged(c.env, c.executionCtx as ExecutionContext, agent, conversation.id);
  const [result] = await withOnline(c, [updated]);
  return c.json(result);
});

conversationTagRoutes.delete("/:id/tags/:tagId", async (c) => {
  requirePermission(c, "inbox.update");
  const agent = c.get("agent");
  const conversation = await getConversation(c.env, c.req.param("id"));
  const removed = await c.env.DB.prepare("DELETE FROM conversation_tags WHERE conversation_id = ? AND tag_id = ?")
    .bind(conversation.id, c.req.param("tagId"))
    .run();
  const updated = removed.meta.changes
    ? await labelsChanged(c.env, c.executionCtx as ExecutionContext, agent, conversation.id)
    : conversation;
  const [result] = await withOnline(c, [updated]);
  return c.json(result);
});

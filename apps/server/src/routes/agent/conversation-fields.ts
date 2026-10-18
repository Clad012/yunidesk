import { Hono } from "hono";
import { z } from "zod";
import { CONVERSATION_FIELD_TYPES } from "yunidesk";
import { readBody, type AppEnv } from "../../app-env";
import type { ConversationFieldRow } from "../../db/rows";
import { requirePermission } from "../../lib/permissions";
import {
  FIELD_KEY_PATTERN,
  MAX_FIELDS,
  MAX_OPTION_LENGTH,
  MAX_SELECT_OPTIONS,
  toConversationField,
} from "../../lib/custom-fields";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";

const labelSchema = z.string().trim().min(1).max(60);
const optionsSchema = z
  .array(z.string().trim().min(1).max(MAX_OPTION_LENGTH))
  .max(MAX_SELECT_OPTIONS)
  .refine((options) => new Set(options).size === options.length, "Options must be unique");
const createSchema = z.object({
  key: z.string().regex(FIELD_KEY_PATTERN, "Lowercase letters, digits and _ (starting with a letter), up to 40"),
  label: labelSchema,
  type: z.enum(CONVERSATION_FIELD_TYPES),
  options: optionsSchema.optional(),
});
/** Key and type are fixed once created: stored values depend on them. */
const patchSchema = z.object({ label: labelSchema.optional(), options: optionsSchema.optional() });
const reorderSchema = z.object({ ids: z.array(z.string().max(64)).max(MAX_FIELDS) });

async function listFields(db: D1Database): Promise<ConversationFieldRow[]> {
  const { results } = await db.prepare("SELECT * FROM conversation_fields ORDER BY position, created_at").all<ConversationFieldRow>();
  return results;
}

export const conversationFieldRoutes = new Hono<AppEnv>();

conversationFieldRoutes.get("/", async (c) => c.json({ items: (await listFields(c.env.DB)).map(toConversationField) }));

conversationFieldRoutes.post("/", async (c) => {
  requirePermission(c, "settings.manage");
  const input = await readBody(c, createSchema);
  const options = input.type === "select" ? (input.options ?? []) : [];
  if (input.type === "select" && options.length === 0) throw badRequest("A select field needs at least one option");
  const existing = await listFields(c.env.DB);
  if (existing.length >= MAX_FIELDS) throw badRequest(`Up to ${MAX_FIELDS} fields`);
  const row: ConversationFieldRow = {
    id: newId("fld"),
    key: input.key,
    label: input.label,
    type: input.type,
    options: input.type === "select" ? JSON.stringify(options) : null,
    position: existing.reduce((max, f) => Math.max(max, f.position), -1) + 1,
    created_at: Date.now(),
  };
  try {
    await c.env.DB.prepare(
      "INSERT INTO conversation_fields (id, key, label, type, options, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(row.id, row.key, row.label, row.type, row.options, row.position, row.created_at)
      .run();
  } catch (error) {
    if (String(error).includes("UNIQUE")) throw conflict("A field with this key already exists");
    throw error;
  }
  return c.json(toConversationField(row), 201);
});

conversationFieldRoutes.post("/reorder", async (c) => {
  requirePermission(c, "settings.manage");
  const { ids } = await readBody(c, reorderSchema);
  const existing = await listFields(c.env.DB);
  const known = new Set(existing.map((f) => f.id));
  if (ids.length !== existing.length || new Set(ids).size !== ids.length || !ids.every((id) => known.has(id))) {
    throw badRequest("Send every field id once, in the new order");
  }
  if (ids.length) {
    await c.env.DB.batch(ids.map((id, position) => c.env.DB.prepare("UPDATE conversation_fields SET position = ? WHERE id = ?").bind(position, id)));
  }
  return c.json({ items: (await listFields(c.env.DB)).map(toConversationField) });
});

conversationFieldRoutes.patch("/:id", async (c) => {
  requirePermission(c, "settings.manage");
  const input = await readBody(c, patchSchema);
  const row = await c.env.DB.prepare("SELECT * FROM conversation_fields WHERE id = ?").bind(c.req.param("id")).first<ConversationFieldRow>();
  if (!row) throw notFound("Field not found");
  if (input.options !== undefined && row.type !== "select") throw badRequest("Only select fields have options");
  if (input.options !== undefined && input.options.length === 0) throw badRequest("A select field needs at least one option");
  const next: ConversationFieldRow = {
    ...row,
    label: input.label ?? row.label,
    options: input.options !== undefined ? JSON.stringify(input.options) : row.options,
  };
  await c.env.DB.prepare("UPDATE conversation_fields SET label = ?, options = ? WHERE id = ?").bind(next.label, next.options, row.id).run();
  return c.json(toConversationField(next));
});

conversationFieldRoutes.delete("/:id", async (c) => {
  requirePermission(c, "settings.manage");
  const row = await c.env.DB.prepare("SELECT * FROM conversation_fields WHERE id = ?").bind(c.req.param("id")).first<ConversationFieldRow>();
  if (!row) return c.json({ ok: true });
  // The key matched FIELD_KEY_PATTERN when it was created, so it is a plain JSON path segment.
  const path = `$.${row.key}`;
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM conversation_fields WHERE id = ?").bind(row.id),
    c.env.DB.prepare("UPDATE conversations SET custom_fields = json_remove(custom_fields, ?) WHERE json_type(custom_fields, ?) IS NOT NULL").bind(path, path),
  ]);
  return c.json({ ok: true });
});

import { MAX_TAG_NAME_LENGTH, TAG_COLORS, type Tag, type TagColor } from "yunidesk";
import type { Env } from "../env";
import { selectIn, type TagRow } from "./rows";

export function toTag(row: Pick<TagRow, "id" | "name" | "color">): Tag {
  return { id: row.id, name: row.name, color: (TAG_COLORS as readonly string[]).includes(row.color) ? row.color : "gray" };
}

/** Trims, folds inner whitespace and drops control characters; null when nothing usable is left. */
export function normalizeTagName(input: string): string | null {
  return cleanName(input, MAX_TAG_NAME_LENGTH);
}

/** Trims, folds inner whitespace and drops control and direction characters; null when empty or too long. */
export function cleanName(input: string, maxLength: number): string | null {
  const name = input
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return name.length > 0 && name.length <= maxLength ? name : null;
}

export function isTagColor(value: string): value is TagColor {
  return (TAG_COLORS as readonly string[]).includes(value);
}

/** Tags of each conversation, alphabetical, in one query (no N+1). */
export async function loadConversationTags(env: Env, conversationIds: readonly string[]): Promise<Map<string, Tag[]>> {
  const out = new Map<string, Tag[]>();
  if (conversationIds.length === 0) return out;
  const rows = await selectIn<TagRow & { conversation_id: string }>(
    env.DB,
    conversationIds,
    (ph) => `SELECT ct.conversation_id, t.id, t.name, t.color, t.created_at
      FROM conversation_tags ct JOIN tags t ON t.id = ct.tag_id
      WHERE ct.conversation_id IN (${ph})
      ORDER BY t.name COLLATE NOCASE`,
  );
  for (const row of rows) {
    const list = out.get(row.conversation_id) ?? [];
    list.push(toTag(row));
    out.set(row.conversation_id, list);
  }
  return out;
}

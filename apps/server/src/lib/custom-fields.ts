import type { ConversationField, CustomFieldValue, CustomFields } from "yunidesk";
import type { ConversationFieldRow } from "../db/rows";

// Custom fields on conversations: definitions live in `conversation_fields`, values in
// `conversations.custom_fields` (a JSON object keyed by field key). Team only.

export const MAX_FIELDS = 50;
export const MAX_TEXT_VALUE_LENGTH = 1000;
export const MAX_SELECT_OPTIONS = 50;
export const MAX_OPTION_LENGTH = 60;
export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
/** Numbers beyond this lose precision in JSON and are almost certainly a typo. */
const MAX_ABS_NUMBER = 1e15;
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseOptions(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function toConversationField(row: ConversationFieldRow): ConversationField {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    type: row.type,
    options: row.type === "select" ? parseOptions(row.options) : [],
    position: row.position,
    createdAt: row.created_at,
  };
}

/** Stored values; anything that isn't a flat object of scalars reads as empty. */
export function parseCustomFields(raw: string | null | undefined): CustomFields {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const out: CustomFields = {};
    for (const [key, v] of Object.entries(value)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") out[key] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** A real calendar day written as YYYY-MM-DD (2026-02-30 is refused). */
export function isIsoDate(value: string): boolean {
  const match = DATE_PATTERN.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  // An impossible day rolls over into another month (Feb 30 → Mar 2), a 2-digit year into 19xx.
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1;
}

type Checked = { ok: true; value: CustomFieldValue } | { ok: false; error: string };

function checkValue(field: ConversationField, value: unknown): Checked {
  const fail = (reason: string): Checked => ({ ok: false, error: `${field.label}: ${reason}` });
  const pass = (v: CustomFieldValue): Checked => ({ ok: true, value: v });
  switch (field.type) {
    case "text": {
      if (typeof value !== "string") return fail("expected text");
      const text = value.trim();
      if (text.length > MAX_TEXT_VALUE_LENGTH) return fail(`at most ${MAX_TEXT_VALUE_LENGTH} characters`);
      return pass(text);
    }
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) return fail("expected a number");
      if (Math.abs(value) > MAX_ABS_NUMBER) return fail("number too large");
      return pass(value);
    case "select":
      if (typeof value !== "string" || !field.options.includes(value)) return fail("pick one of the options");
      return pass(value);
    case "checkbox":
      if (typeof value !== "boolean") return fail("expected true or false");
      return pass(value);
    case "date":
      if (typeof value !== "string" || !isIsoDate(value)) return fail("expected a date like 2026-10-18");
      return pass(value);
  }
}

export type CustomFieldsPatch = Record<string, CustomFieldValue | null>;

/**
 * Checks `{ key: value | null }` against the field definitions: unknown keys, wrong types, values
 * outside a select's options and over-long text are refused. `null` clears a value; an empty text
 * clears it too. Returns the cleaned patch, or the first problem found.
 */
export function validateCustomFieldsPatch(
  fields: readonly ConversationField[],
  patch: unknown,
): { ok: true; value: CustomFieldsPatch } | { ok: false; error: string } {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return { ok: false, error: "customFields must be an object" };
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const entries = Object.entries(patch);
  if (entries.length > MAX_FIELDS) return { ok: false, error: `At most ${MAX_FIELDS} fields at once` };
  const value: CustomFieldsPatch = {};
  for (const [key, raw] of entries) {
    const field = byKey.get(key);
    if (!field) return { ok: false, error: `Unknown field "${key.slice(0, 40)}"` };
    if (raw === null) {
      value[key] = null;
      continue;
    }
    const checked = checkValue(field, raw);
    if (!checked.ok) return checked;
    value[key] = checked.value === "" ? null : checked.value;
  }
  return { ok: true, value };
}

/** What the stored object becomes after the patch (same rule as SQLite's json_patch: null removes). */
export function mergeCustomFields(current: CustomFields, patch: CustomFieldsPatch): CustomFields {
  const out: CustomFields = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete out[key];
    else out[key] = value;
  }
  return out;
}

export function sameCustomFields(a: CustomFields, b: CustomFields): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => Object.is(a[k], b[k]));
}

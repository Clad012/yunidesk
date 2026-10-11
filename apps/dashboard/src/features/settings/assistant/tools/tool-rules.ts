import { copy } from "@/lib/copy";

export const TOOL_NAME = /^[a-z][a-z0-9_]{1,40}$/;

export const EMPTY_INPUT_SCHEMA = JSON.stringify({ type: "object", properties: {}, required: [] }, null, 2);

export type SchemaParse = { ok: true; schema: Record<string, unknown> } | { ok: false; error: string };

/** The tool's argument schema as typed: a JSON object whose `type` is "object". */
export function parseInputSchema(text: string): SchemaParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: copy.assistantTools.schemaNotJson };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed) || (parsed as Record<string, unknown>).type !== "object") {
    return { ok: false, error: copy.assistantTools.schemaNotObject };
  }
  return { ok: true, schema: parsed as Record<string, unknown> };
}

/** "api.example.com" for display; the raw text when it isn't a URL. */
export function urlHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

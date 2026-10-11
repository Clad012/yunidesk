import { jsonSchema, tool, type ToolSet } from "ai";
import type { AssistantToolCall } from "yunidesk";
import { newId } from "../ids";
import { isAllowedWebhookUrl, signatureHeader } from "../webhooks";

export interface AssistantToolRow {
  id: string;
  name: string;
  description: string;
  input_schema: string;
  url: string;
  enabled: number;
  created_at: number;
  updated_at: number;
}

export const TOOL_NAME = /^[a-z][a-z0-9_]{1,40}$/;
const CALL_TIMEOUT_MS = 8_000;
const MAX_RESULT_CHARS = 4_000;

export interface ToolCallRecord {
  name: string;
  ok: boolean;
}

/**
 * One tool call: POSTed to the owner's URL, signed like webhooks with the tools' secret, with the
 * customer it is for. Whatever comes back is cut short and handed to the model as data.
 */
export async function callTool(
  url: string,
  secret: string,
  body: AssistantToolCall,
  ownHost: string,
  fetcher: typeof fetch = fetch,
): Promise<{ ok: boolean; result: unknown }> {
  if (!isAllowedWebhookUrl(url, ownHost)) return { ok: false, result: { error: "This tool's address is not allowed" } };
  const raw = JSON.stringify(body);
  try {
    const response = await fetcher(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "yunidesk-assistant",
        "x-yunidesk-event": "assistant.tool_call",
        "x-yunidesk-signature": await signatureHeader([secret], Date.now(), raw),
      },
      body: raw,
      redirect: "manual",
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    const text = (await response.text()).slice(0, MAX_RESULT_CHARS);
    if (!response.ok) return { ok: false, result: { error: `The tool answered HTTP ${response.status}` } };
    try {
      return { ok: true, result: JSON.parse(text) as unknown };
    } catch {
      return { ok: true, result: text };
    }
  } catch {
    return { ok: false, result: { error: "The tool could not be reached" } };
  }
}

/** The AI SDK tools for one reply. Each call is recorded so the reply can say what it used. */
export function buildTools(
  rows: AssistantToolRow[],
  context: {
    secret: string | null;
    ownHost: string;
    conversationId: string;
    contact: AssistantToolCall["contact"];
    calls: ToolCallRecord[];
  },
): ToolSet {
  if (!context.secret) return {};
  const secret = context.secret;
  const tools: ToolSet = {};
  for (const row of rows) {
    if (!row.enabled || !TOOL_NAME.test(row.name)) continue;
    let schema: Record<string, unknown>;
    try {
      schema = JSON.parse(row.input_schema) as Record<string, unknown>;
    } catch {
      continue;
    }
    tools[row.name] = tool({
      description: row.description,
      inputSchema: jsonSchema(schema),
      execute: async (input) => {
        const outcome = await callTool(row.url, secret, {
          id: newId("evt"),
          tool: row.name,
          arguments: (input ?? {}) as Record<string, unknown>,
          conversationId: context.conversationId,
          contact: context.contact,
          createdAt: Date.now(),
        }, context.ownHost);
        context.calls.push({ name: row.name, ok: outcome.ok });
        return outcome.result;
      },
    });
  }
  return tools;
}

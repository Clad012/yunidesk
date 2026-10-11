import type { AssistantSettings } from "yunidesk";
import type { Env } from "../../env";
import { openSecret, sealSecret } from "../secret-box";

/**
 * The AI assistant's configuration, in the settings table under "assistant". The OpenRouter key
 * and the tools' signing secret are sealed (AES-GCM, secret-box) and never leave the server.
 */
export interface StoredAssistant {
  enabled: boolean;
  name: string;
  instructions: string;
  model: string;
  allowAnonymous: boolean;
  dailyBudgetUsd: number;
  openRouterKeySealed: string | null;
  toolSecretSealed: string | null;
  /** The bot teammate its messages are written as. */
  agentId: string | null;
}

export const DEFAULT_MODEL = "z-ai/glm-5.3-flash";

export const DEFAULT_ASSISTANT: StoredAssistant = {
  enabled: false,
  name: "Assistant",
  instructions: "",
  model: DEFAULT_MODEL,
  allowAnonymous: true,
  dailyBudgetUsd: 2,
  openRouterKeySealed: null,
  toolSecretSealed: null,
  agentId: null,
};

const KEY = "assistant";
const KEY_PURPOSE = "assistant-openrouter-key";
const TOOL_SECRET_PURPOSE = "assistant-tool-secret";
const BOUND_TO = "workspace";

export async function getAssistant(env: Env): Promise<StoredAssistant> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(KEY).first<{ value: string }>();
  return { ...DEFAULT_ASSISTANT, ...(row ? (JSON.parse(row.value) as Partial<StoredAssistant>) : {}) };
}

export async function saveAssistant(env: Env, patch: Partial<StoredAssistant>): Promise<StoredAssistant> {
  const next = { ...(await getAssistant(env)), ...patch };
  await env.DB.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  )
    .bind(KEY, JSON.stringify(next), Date.now())
    .run();
  return next;
}

export function toAssistantSettings(stored: StoredAssistant): AssistantSettings {
  return {
    enabled: stored.enabled,
    name: stored.name,
    instructions: stored.instructions,
    model: stored.model,
    allowAnonymous: stored.allowAnonymous,
    dailyBudgetUsd: stored.dailyBudgetUsd,
    hasOpenRouterKey: Boolean(stored.openRouterKeySealed),
  };
}

export function sealOpenRouterKey(env: Env, key: string): Promise<string> {
  return sealSecret(env.SESSION_SECRET, KEY_PURPOSE, BOUND_TO, key);
}

export async function openOpenRouterKey(env: Env, stored: StoredAssistant): Promise<string | null> {
  return stored.openRouterKeySealed ? openSecret(env.SESSION_SECRET, KEY_PURPOSE, BOUND_TO, stored.openRouterKeySealed) : null;
}

export function sealToolSecret(env: Env, secret: string): Promise<string> {
  return sealSecret(env.SESSION_SECRET, TOOL_SECRET_PURPOSE, BOUND_TO, secret);
}

export async function openToolSecret(env: Env, stored: StoredAssistant): Promise<string | null> {
  return stored.toolSecretSealed ? openSecret(env.SESSION_SECRET, TOOL_SECRET_PURPOSE, BOUND_TO, stored.toolSecretSealed) : null;
}

/** Whether the assistant can answer at all right now. */
export function isAssistantReady(stored: StoredAssistant): boolean {
  return stored.enabled && Boolean(stored.openRouterKeySealed);
}

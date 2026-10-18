import { API_SCOPES, type ApiKey, type ApiScope } from "yunidesk";
import type { AppContext } from "../app-env";
import type { AgentRow } from "../db/rows";
import { toPublicAgent } from "../db/serialize";
import { sha256 } from "./crypto";
import { forbidden, tooManyRequests, unauthorized } from "./errors";

/**
 * Keys look like `ydk_<32 random chars><7 char checksum>` (160 random bits, Crockford-style base32).
 * The fixed prefix lets secret scanners and people spot a leaked key; the CRC32 checksum lets us
 * reject typos and garbage without a database lookup. Only the SHA-256 of a key is stored.
 */
export const API_KEY_PREFIX = "ydk_";
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const RANDOM_LENGTH = 32;
const CHECKSUM_LENGTH = 7;
const KEY_PATTERN = new RegExp(`^${API_KEY_PREFIX}[${ALPHABET}]{${RANDOM_LENGTH + CHECKSUM_LENGTH}}$`);
/** Characters kept to recognise a key in lists. */
const DISPLAY_PREFIX_LENGTH = API_KEY_PREFIX.length + 6;
const LAST_USED_RESOLUTION_MS = 60_000;

export interface ApiKeyRow {
  id: string;
  name: string;
  token_hash: string;
  token_prefix: string;
  scopes: string;
  bot_agent_id: string;
  created_by: string;
  created_at: number;
  expires_at: number | null;
  last_used_at: number | null;
  revoked_at: number | null;
  revoked_by: string | null;
}

export interface ApiKeyAuth {
  id: string;
  scopes: ApiScope[];
}

function crc32(value: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < value.length; i++) {
    crc ^= value.charCodeAt(i);
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function checksum(random: string): string {
  let n = crc32(random);
  let out = "";
  for (let i = 0; i < CHECKSUM_LENGTH; i++) {
    out = ALPHABET[n % 32] + out;
    n = Math.floor(n / 32);
  }
  return out;
}

export function generateApiKey(): string {
  const bytes = new Uint8Array(RANDOM_LENGTH);
  crypto.getRandomValues(bytes);
  // 256 is a multiple of 32, so `% 32` stays uniform.
  const random = Array.from(bytes, (b) => ALPHABET[b % 32]).join("");
  return `${API_KEY_PREFIX}${random}${checksum(random)}`;
}

/** Shape and checksum only; says nothing about whether the key exists. */
export function isWellFormedApiKey(token: string): boolean {
  if (!KEY_PATTERN.test(token)) return false;
  const body = token.slice(API_KEY_PREFIX.length);
  return checksum(body.slice(0, RANDOM_LENGTH)) === body.slice(RANDOM_LENGTH);
}

export function displayPrefix(token: string): string {
  return token.slice(0, DISPLAY_PREFIX_LENGTH);
}

export async function hashApiKey(token: string): Promise<string> {
  return sha256(token);
}

export function parseScopes(raw: string): ApiScope[] {
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((s): s is ApiScope => (API_SCOPES as readonly string[]).includes(s as string));
  } catch {
    return [];
  }
}

export function toApiKey(row: ApiKeyRow, bot: Pick<AgentRow, "id" | "name" | "avatar_url" | "kind">): ApiKey {
  return {
    id: row.id,
    name: row.name,
    prefix: row.token_prefix,
    scopes: parseScopes(row.scopes),
    bot: toPublicAgent(bot),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

// ---- What a key may call ----

const ID = "[a-z]{3}_[0-9a-z]{26}";

/** `null`: any valid key. Everything not listed here is refused to API keys (deny by default). */
const KEY_ROUTES: { method: string; path: RegExp; scope: ApiScope | null }[] = [
  { method: "GET", path: /^\/key$/, scope: null },
  { method: "GET", path: /^\/events$/, scope: null },
  { method: "GET", path: /^\/teammates$/, scope: "conversations:read" },
  { method: "GET", path: /^\/conversations$/, scope: "conversations:read" },
  { method: "GET", path: /^\/conversations\/counts$/, scope: "conversations:read" },
  { method: "GET", path: new RegExp(`^/conversations/${ID}$`), scope: "conversations:read" },
  { method: "GET", path: new RegExp(`^/conversations/${ID}/messages$`), scope: "conversations:read" },
  { method: "POST", path: new RegExp(`^/conversations/${ID}/messages$`), scope: "conversations:write" },
  { method: "PATCH", path: new RegExp(`^/conversations/${ID}$`), scope: "conversations:write" },
  { method: "POST", path: /^\/attachments$/, scope: "conversations:write" },
  { method: "GET", path: /^\/contacts$/, scope: "contacts:read" },
  { method: "GET", path: new RegExp(`^/contacts/${ID}$`), scope: "contacts:read" },
  { method: "GET", path: /^\/assistant$/, scope: "assistant:write" },
  { method: "PATCH", path: /^\/assistant$/, scope: "assistant:write" },
  { method: "PUT", path: /^\/assistant\/openrouter-key$/, scope: "assistant:write" },
  { method: "DELETE", path: /^\/assistant\/openrouter-key$/, scope: "assistant:write" },
  { method: "GET", path: /^\/assistant\/usage$/, scope: "assistant:write" },
  { method: "POST", path: /^\/assistant\/preview$/, scope: "assistant:write" },
  { method: "GET", path: /^\/assistant\/knowledge$/, scope: "assistant:write" },
  { method: "POST", path: /^\/assistant\/knowledge$/, scope: "assistant:write" },
  { method: "PATCH", path: new RegExp(`^/assistant/knowledge/${ID}$`), scope: "assistant:write" },
  { method: "DELETE", path: new RegExp(`^/assistant/knowledge/${ID}$`), scope: "assistant:write" },
  { method: "GET", path: /^\/assistant\/tools$/, scope: "assistant:write" },
  { method: "POST", path: /^\/assistant\/tools$/, scope: "assistant:write" },
  { method: "POST", path: /^\/assistant\/tools\/roll-secret$/, scope: "assistant:write" },
  { method: "PATCH", path: new RegExp(`^/assistant/tools/${ID}$`), scope: "assistant:write" },
  { method: "DELETE", path: new RegExp(`^/assistant/tools/${ID}$`), scope: "assistant:write" },
  { method: "GET", path: /^\/webhook-endpoints$/, scope: "webhooks:write" },
  { method: "POST", path: /^\/webhook-endpoints$/, scope: "webhooks:write" },
  { method: "GET", path: new RegExp(`^/webhook-endpoints/${ID}$`), scope: "webhooks:write" },
  { method: "PATCH", path: new RegExp(`^/webhook-endpoints/${ID}$`), scope: "webhooks:write" },
  { method: "DELETE", path: new RegExp(`^/webhook-endpoints/${ID}$`), scope: "webhooks:write" },
  { method: "POST", path: new RegExp(`^/webhook-endpoints/${ID}/roll-secret$`), scope: "webhooks:write" },
  { method: "POST", path: new RegExp(`^/webhook-endpoints/${ID}/test$`), scope: "webhooks:write" },
  { method: "GET", path: new RegExp(`^/webhook-endpoints/${ID}/deliveries$`), scope: "webhooks:write" },
  // Deliberately session only: /audit-log (owners, admins) and /sso (owners).
];

/**
 * The scope a key needs for `method path` (path relative to /api/agent), `null` when any key will
 * do, or `undefined` when keys may not call it at all.
 */
export function requiredScope(method: string, path: string): ApiScope | null | undefined {
  const verb = method === "HEAD" ? "GET" : method;
  return KEY_ROUTES.find((route) => route.method === verb && route.path.test(path))?.scope;
}

/** Authenticates `Authorization: Bearer ydk_…` and checks the key may call this route. */
export async function authenticateApiKey(
  c: AppContext,
  relativePath: string,
): Promise<{ auth: ApiKeyAuth; agent: AgentRow }> {
  const header = c.req.header("authorization") ?? "";
  const match = /^Bearer ([^\s]+)$/.exec(header);
  const token = match?.[1] ?? "";
  if (!isWellFormedApiKey(token)) return rejected(c, "Invalid API key");

  const now = Date.now();
  const row = await c.env.DB.prepare(
    `SELECT k.*, a.name AS agent_name, a.disabled_at AS agent_disabled_at
     FROM api_keys k JOIN agents a ON a.id = k.bot_agent_id
     WHERE k.token_hash = ?`,
  )
    .bind(await hashApiKey(token))
    .first<ApiKeyRow & { agent_name: string; agent_disabled_at: number | null }>();
  if (!row) return rejected(c, "Invalid API key");
  if (row.revoked_at !== null) throw unauthorized("This API key was revoked");
  if (row.expires_at !== null && row.expires_at <= now) throw unauthorized("This API key has expired");
  if (row.agent_disabled_at !== null) throw unauthorized("This API key is disabled");

  const scopes = parseScopes(row.scopes);
  const needed = requiredScope(c.req.method, relativePath);
  if (needed === undefined) throw forbidden("API keys can't use this endpoint");
  if (needed !== null && !scopes.includes(needed)) throw forbidden(`This API key needs the ${needed} scope`);

  if (!row.last_used_at || now - row.last_used_at > LAST_USED_RESOLUTION_MS) {
    c.executionCtx.waitUntil(c.env.DB.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").bind(now, row.id).run());
  }
  const agent = await c.env.DB.prepare("SELECT * FROM agents WHERE id = ?").bind(row.bot_agent_id).first<AgentRow>();
  if (!agent) throw unauthorized("Invalid API key");
  return { auth: { id: row.id, scopes }, agent };
}

/** Wrong keys are counted per IP so guessing gets throttled. */
async function rejected(c: AppContext, message: string): Promise<never> {
  const { success } = await c.env.AUTH_LIMITER.limit({ key: `api-key:${c.req.header("cf-connecting-ip") ?? "local"}` });
  if (!success) throw tooManyRequests();
  throw unauthorized(message);
}

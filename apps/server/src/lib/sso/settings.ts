import type { SsoSettings } from "yunidesk";
import type { Env } from "../../env";
import { openSecret, sealSecret } from "../secret-box";

/** Single sign-on configuration, in the settings table under "sso". The client secret is sealed. */
export interface StoredSso {
  enabled: boolean;
  issuer: string;
  clientId: string;
  clientSecretSealed: string | null;
  allowedDomains: string[];
  requireSso: boolean;
  createRole: "agent" | "viewer" | null;
}

export const DEFAULT_SSO: StoredSso = {
  enabled: false,
  issuer: "",
  clientId: "",
  clientSecretSealed: null,
  allowedDomains: [],
  requireSso: false,
  createRole: null,
};

const KEY = "sso";
const SECRET_PURPOSE = "sso-client-secret";
const BOUND_TO = "workspace";

export async function getSso(env: Env): Promise<StoredSso> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(KEY).first<{ value: string }>();
  return { ...DEFAULT_SSO, ...(row ? (JSON.parse(row.value) as Partial<StoredSso>) : {}) };
}

export async function saveSso(env: Env, next: StoredSso): Promise<StoredSso> {
  await env.DB.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  )
    .bind(KEY, JSON.stringify(next), Date.now())
    .run();
  return next;
}

/** Configured completely and turned on. */
export function isSsoReady(sso: StoredSso): boolean {
  return sso.enabled && Boolean(sso.issuer && sso.clientId && sso.clientSecretSealed) && sso.allowedDomains.length > 0;
}

export function callbackUrl(origin: string): string {
  return `${origin}/api/agent/auth/sso/callback`;
}

export function toSsoSettings(sso: StoredSso, origin: string): SsoSettings {
  return {
    enabled: sso.enabled,
    issuer: sso.issuer,
    clientId: sso.clientId,
    hasClientSecret: Boolean(sso.clientSecretSealed),
    allowedDomains: sso.allowedDomains,
    requireSso: sso.requireSso,
    createRole: sso.createRole,
    callbackUrl: callbackUrl(origin),
  };
}

export function sealClientSecret(env: Env, secret: string): Promise<string> {
  return sealSecret(env.SESSION_SECRET, SECRET_PURPOSE, BOUND_TO, secret);
}

export function openClientSecret(env: Env, sealed: string): Promise<string> {
  return openSecret(env.SESSION_SECRET, SECRET_PURPOSE, BOUND_TO, sealed);
}

import type { EmailChannelSettings, EmailProvider, EmailProviderSetting } from "yunidesk";
import type { Env } from "../../env";
import { domainOf, normalizeAddress } from "./addresses";
import { DEFAULT_AUTHSERV_ID } from "./auth-results";
import { cloudflareTransport, resendTransport, type EmailTransport } from "./transport";

/** The email channel's configuration, in the settings table under "email". */
export interface StoredEmailChannel {
  enabled: boolean;
  inboundAddress: string | null;
  fromName: string | null;
  fromAddress: string | null;
  provider: EmailProviderSetting;
}

export const DEFAULT_EMAIL_CHANNEL: StoredEmailChannel = {
  enabled: false,
  inboundAddress: null,
  fromName: null,
  fromAddress: null,
  provider: "auto",
};

const KEY = "email";

export async function getEmailChannel(env: Env): Promise<StoredEmailChannel> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(KEY).first<{ value: string }>();
  return { ...DEFAULT_EMAIL_CHANNEL, ...(row ? (JSON.parse(row.value) as Partial<StoredEmailChannel>) : {}) };
}

export async function saveEmailChannel(env: Env, patch: Partial<StoredEmailChannel>): Promise<StoredEmailChannel> {
  const next = { ...(await getEmailChannel(env)), ...patch };
  await env.DB.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  )
    .bind(KEY, JSON.stringify(next), Date.now())
    .run();
  return next;
}

/** `auto` prefers Cloudflare Email Service; an explicit choice is used only when it is configured. */
export function chooseProvider(setting: EmailProviderSetting, available: Record<EmailProvider, boolean>): EmailProvider | null {
  if (setting === "auto") return available.cloudflare ? "cloudflare" : available.resend ? "resend" : null;
  return available[setting] ? setting : null;
}

/** What the channel actually runs with: env values win over settings for the inbound address. */
export interface EmailConfig {
  enabled: boolean;
  inboundAddress: string | null;
  inboundAddressFromEnv: boolean;
  /** Domain of the inbound address: reply+…@ lives there. */
  replyDomain: string | null;
  fromAddress: string | null;
  fromName: string | null;
  provider: EmailProvider | null;
  available: Record<EmailProvider, boolean>;
  authservId: string;
}

export function resolveEmailConfig(env: Env, stored: StoredEmailChannel): EmailConfig {
  const envInbound = normalizeAddress(env.EMAIL_INBOUND_ADDRESS);
  const inboundAddress = envInbound ?? normalizeAddress(stored.inboundAddress);
  const available = { cloudflare: Boolean(env.SEND_EMAIL), resend: Boolean(env.RESEND_API_KEY) };
  return {
    enabled: stored.enabled,
    inboundAddress,
    inboundAddressFromEnv: Boolean(envInbound),
    replyDomain: inboundAddress ? domainOf(inboundAddress) : null,
    fromAddress: normalizeAddress(stored.fromAddress) ?? normalizeAddress(env.EMAIL_FROM) ?? inboundAddress,
    fromName: stored.fromName?.trim() || null,
    provider: chooseProvider(stored.provider, available),
    available,
    authservId: env.EMAIL_AUTHSERV_ID?.trim() || DEFAULT_AUTHSERV_ID,
  };
}

export async function loadEmailConfig(env: Env): Promise<EmailConfig> {
  return resolveEmailConfig(env, await getEmailChannel(env));
}

export function transportFor(env: Env, provider: EmailProvider | null): EmailTransport | null {
  if (provider === "cloudflare" && env.SEND_EMAIL) return cloudflareTransport(env.SEND_EMAIL);
  if (provider === "resend" && env.RESEND_API_KEY) return resendTransport(env.RESEND_API_KEY);
  return null;
}

export async function toEmailChannelSettings(env: Env, stored: StoredEmailChannel): Promise<EmailChannelSettings> {
  const config = resolveEmailConfig(env, stored);
  const [inbound, outbound] = await Promise.all([
    env.DB.prepare("SELECT created_at AS at FROM email_originals ORDER BY created_at DESC LIMIT 1").first<{ at: number }>(),
    env.DB.prepare(
      "SELECT created_at AS at FROM messages WHERE email_direction = 'outbound' AND email_status = 'sent' ORDER BY created_at DESC LIMIT 1",
    ).first<{ at: number }>(),
  ]);
  return {
    enabled: stored.enabled,
    inboundAddress: config.inboundAddress,
    inboundAddressFromEnv: config.inboundAddressFromEnv,
    fromName: stored.fromName,
    fromAddress: stored.fromAddress,
    provider: stored.provider,
    status: {
      activeProvider: config.provider,
      cloudflareReady: config.available.cloudflare,
      resendReady: config.available.resend,
      effectiveFromAddress: config.fromAddress,
      replyDomain: config.replyDomain,
      lastInboundAt: inbound?.at ?? null,
      lastOutboundAt: outbound?.at ?? null,
    },
  };
}

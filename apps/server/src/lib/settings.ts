import { DEFAULT_BUSINESS_HOURS, type AdminSettings, type BusinessHours, type LocalizedText, type WidgetSettings } from "yunidesk";
import type { Env } from "../env";

export interface StoredSettings extends WidgetSettings {
  allowedOrigins: string[];
  webhookUrl: string | null;
  webhookSecret: string | null;
  retentionDays: number;
  businessHours: BusinessHours;
  awayMessage: LocalizedText;
}

export const DEFAULT_SETTINGS: StoredSettings = {
  teamName: "Support",
  brandColor: "#6d5dfc",
  greeting: {},
  intro: {},
  replyTime: "minutes",
  launcherPosition: "right",
  allowAnonymous: true,
  askEmailForAnonymous: true,
  allowedOrigins: [],
  webhookUrl: null,
  webhookSecret: null,
  retentionDays: 730,
  businessHours: DEFAULT_BUSINESS_HOURS,
  awayMessage: {},
};

const KEY = "workspace";
const CACHE_MS = 15_000;
let cache: { value: StoredSettings; at: number } | null = null;

export async function getSettings(env: Env): Promise<StoredSettings> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(KEY).first<{ value: string }>();
  const stored = row ? (JSON.parse(row.value) as Partial<StoredSettings>) : {};
  const value = { ...DEFAULT_SETTINGS, ...stored };
  cache = { value, at: Date.now() };
  return value;
}

export async function saveSettings(env: Env, patch: Partial<StoredSettings>): Promise<StoredSettings> {
  const next = { ...(await getSettings(env)), ...patch };
  await env.DB.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  )
    .bind(KEY, JSON.stringify(next), Date.now())
    .run();
  cache = { value: next, at: Date.now() };
  return next;
}

export function toAdminSettings(settings: StoredSettings): AdminSettings {
  const { webhookSecret, ...rest } = settings;
  return { ...rest, hasWebhookSecret: Boolean(webhookSecret) };
}

export function toWidgetSettings(settings: StoredSettings): WidgetSettings {
  return {
    teamName: settings.teamName,
    brandColor: settings.brandColor,
    greeting: settings.greeting,
    intro: settings.intro,
    replyTime: settings.replyTime,
    launcherPosition: settings.launcherPosition,
    allowAnonymous: settings.allowAnonymous,
    askEmailForAnonymous: settings.askEmailForAnonymous,
  };
}

/** Origins that may embed the widget: the env list plus the ones set in the dashboard. */
export async function embedOrigins(env: Env): Promise<string[]> {
  const fromEnv = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const settings = await getSettings(env);
  return [...new Set([...fromEnv, ...settings.allowedOrigins])].filter(isOrigin);
}

/** An exact origin. Plain http is only accepted for local development hosts. */
export function isOrigin(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.origin !== value) return false;
    if (url.protocol === "https:") return true;
    return url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  } catch {
    return false;
  }
}

import type { Env } from "../env";
import { hmacHex } from "./crypto";
import { getSettings } from "./settings";

export type WebhookEvent =
  | "conversation.created"
  | "message.created"
  | "conversation.updated"
  | "conversation.unread_reply"
  | "conversation.rated";

/**
 * POSTs { event, createdAt, data } to the configured URL.
 * Header `X-Yunidesk-Signature: t=<ms>,v1=<hex hmac-sha256 of "<t>.<body>">` with the webhook secret.
 * Up to three attempts; failures are logged, never thrown.
 */
export async function sendWebhook(env: Env, event: WebhookEvent, data: unknown): Promise<void> {
  const settings = await getSettings(env);
  if (!settings.webhookUrl || !settings.webhookSecret) return;
  const timestamp = Date.now();
  const body = JSON.stringify({ event, createdAt: timestamp, data });
  const signature = await hmacHex(settings.webhookSecret, `${timestamp}.${body}`);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(settings.webhookUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "user-agent": "yunidesk-webhooks",
          "x-yunidesk-event": event,
          "x-yunidesk-signature": `t=${timestamp},v1=${signature}`,
          ...(env.WEBHOOK_LEGACY_SIGNATURE_HEADER
            ? { [env.WEBHOOK_LEGACY_SIGNATURE_HEADER.toLowerCase()]: `t=${timestamp},v1=${signature}` }
            : {}),
        },
        body,
        // A redirect could point anywhere (even plain http); treat it as a failure instead.
        redirect: "manual",
      });
      if (response.ok) return;
      if ((response.status >= 300 && response.status < 400) || (response.status < 500 && response.status !== 429)) {
        console.warn(`webhook ${event} rejected with ${response.status}`);
        return;
      }
    } catch (error) {
      console.warn(`webhook ${event} attempt ${attempt + 1} failed`, error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
  console.error(`webhook ${event} gave up after 3 attempts`);
}

/** Webhook targets must be public https hosts: not this worker, not workers.dev, not an IP or local name. */
export function isAllowedWebhookUrl(value: string, ownHost: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (host === ownHost || host.endsWith(".workers.dev") || host === "localhost" || host.endsWith(".localhost")) return false;
  if (/^[\d.]+$/.test(host) || host.startsWith("[") || !host.includes(".")) return false;
  return true;
}

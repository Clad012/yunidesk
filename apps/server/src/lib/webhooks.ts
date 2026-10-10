import type { WebhookDelivery, WebhookEndpoint } from "yunidesk";
import type { WebhookEventName } from "yunidesk/webhooks";
import type { Env } from "../env";
import { hmacHex } from "./crypto";
import { newId } from "./ids";
import { openSecret, sealSecret } from "./secret-box";
import { getSettings } from "./settings";

export type WebhookEvent = Exclude<WebhookEventName, "ping">;

/**
 * Every event goes to the webhook set in Settings (if any) and to each enabled endpoint that
 * subscribed to it. Body: `{ id, event, createdAt, data }`; header
 * `X-Yunidesk-Signature: t=<ms>,v1=<hex hmac-sha256 of "<t>.<body>">` (one v1 per active secret).
 *
 * Endpoint deliveries are logged and retried with backoff for about 3 days. An endpoint that
 * keeps failing for 3 days, or answers 410 Gone, is disabled. Logs are kept 30 days.
 */

const ATTEMPT_TIMEOUT_MS = 10_000;
/** Delay before attempt n+1, after n failed attempts. 9 attempts over ~3 days. */
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000, 12 * 3600_000, 24 * 3600_000, 24 * 3600_000];
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
const DISABLE_AFTER_FAILING_MS = 3 * 24 * 3600_000;
/** A claimed delivery is retried by the cron if its attempt never reported back. */
const CLAIM_LEASE_MS = 5 * 60_000;
export const DELIVERY_RETENTION_MS = 30 * 24 * 3600_000;
const SECRET_PURPOSE = "webhook-endpoint-secret";
const PREVIOUS_SECRET_PURPOSE = "webhook-endpoint-previous-secret";

export interface WebhookEndpointRow {
  id: string;
  url: string;
  description: string | null;
  events: string;
  secret_ciphertext: string;
  previous_secret_ciphertext: string | null;
  previous_secret_expires_at: number | null;
  api_key_id: string | null;
  created_by: string | null;
  status: "enabled" | "disabled";
  disabled_reason: string | null;
  failing_since: number | null;
  created_at: number;
  updated_at: number;
}

export interface WebhookDeliveryRow {
  id: string;
  endpoint_id: string;
  event_id: string;
  event_type: string;
  contact_id: string | null;
  payload: string;
  status: "pending" | "succeeded" | "failed";
  attempts: number;
  next_attempt_at: number | null;
  last_status_code: number | null;
  last_error: string | null;
  created_at: number;
  completed_at: number | null;
}

// ---- Pure rules (tested) ----

export function parseEvents(raw: string): string[] {
  try {
    const value = JSON.parse(raw) as unknown;
    return Array.isArray(value) ? value.filter((e): e is string => typeof e === "string") : [];
  } catch {
    return [];
  }
}

export function endpointWants(events: readonly string[], event: string): boolean {
  return events.includes("*") || events.includes(event);
}

export type AttemptResult = { ok: true; status: number } | { ok: false; status: number | null; error: string };

export type AttemptOutcome =
  | { delivery: "succeeded" }
  | { delivery: "retry"; nextAttemptAt: number; disableEndpoint: string | null }
  | { delivery: "failed"; disableEndpoint: string | null };

/** What happens after attempt number `attempts` (1-based) ended with `result`. */
export function decideAttempt(attempts: number, result: AttemptResult, failingSince: number | null, now: number): AttemptOutcome {
  if (result.ok) return { delivery: "succeeded" };
  let disableEndpoint: string | null = null;
  if (result.status === 410) disableEndpoint = "The endpoint answered 410 Gone";
  else if (failingSince !== null && now - failingSince >= DISABLE_AFTER_FAILING_MS) {
    disableEndpoint = "Every delivery failed for 3 days";
  }
  const delay = RETRY_DELAYS_MS[attempts - 1];
  if (delay === undefined || disableEndpoint) return { delivery: "failed", disableEndpoint };
  return { delivery: "retry", nextAttemptAt: now + delay, disableEndpoint: null };
}

export async function signatureHeader(secrets: readonly string[], timestamp: number, body: string): Promise<string> {
  const signatures = await Promise.all(secrets.map((secret) => hmacHex(secret, `${timestamp}.${body}`)));
  return [`t=${timestamp}`, ...signatures.map((s) => `v1=${s}`)].join(",");
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

// ---- Secrets ----

export function newWebhookSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `whsec_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function sealEndpointSecret(env: Env, endpointId: string, secret: string): Promise<string> {
  return sealSecret(env.SESSION_SECRET, SECRET_PURPOSE, endpointId, secret);
}

export function sealPreviousEndpointSecret(env: Env, endpointId: string, secret: string): Promise<string> {
  return sealSecret(env.SESSION_SECRET, PREVIOUS_SECRET_PURPOSE, endpointId, secret);
}

export async function openEndpointSecret(env: Env, row: Pick<WebhookEndpointRow, "id" | "secret_ciphertext">): Promise<string> {
  return openSecret(env.SESSION_SECRET, SECRET_PURPOSE, row.id, row.secret_ciphertext);
}

async function activeSecrets(env: Env, row: WebhookEndpointRow, now: number): Promise<string[]> {
  const secrets = [await openEndpointSecret(env, row)];
  if (row.previous_secret_ciphertext && (row.previous_secret_expires_at ?? 0) > now) {
    secrets.push(await openSecret(env.SESSION_SECRET, PREVIOUS_SECRET_PURPOSE, row.id, row.previous_secret_ciphertext));
  }
  return secrets;
}

// ---- Serialising ----

export function toWebhookEndpoint(row: WebhookEndpointRow): WebhookEndpoint {
  return {
    id: row.id,
    url: row.url,
    description: row.description,
    events: parseEvents(row.events),
    status: row.status,
    disabledReason: row.disabled_reason,
    apiKeyId: row.api_key_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toWebhookDelivery(row: WebhookDeliveryRow): WebhookDelivery {
  return {
    id: row.id,
    eventId: row.event_id,
    eventType: row.event_type,
    status: row.status,
    attempts: row.attempts,
    nextAttemptAt: row.status === "pending" ? row.next_attempt_at : null,
    lastStatusCode: row.last_status_code,
    lastError: row.last_error,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

// ---- Sending ----

function contactIdOf(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const record = data as { contactId?: unknown; contact?: { id?: unknown } };
  if (typeof record.contactId === "string") return record.contactId;
  if (typeof record.contact?.id === "string") return record.contact.id;
  return null;
}

/** Sends one event to the Settings webhook and every subscribed endpoint. Never throws. */
export async function sendWebhook(env: Env, event: WebhookEvent, data: unknown): Promise<void> {
  const createdAt = Date.now();
  const body = JSON.stringify({ id: newId("evt"), event, createdAt, data });
  await Promise.all([
    sendToSettingsWebhook(env, event, body).catch((error) => console.error("settings webhook failed", error)),
    queueForEndpoints(env, event, body, contactIdOf(data), createdAt).catch((error) =>
      console.error("webhook endpoint fan-out failed", error),
    ),
  ]);
}

/** The single webhook configured in Settings: three quick attempts, no log. */
async function sendToSettingsWebhook(env: Env, event: WebhookEvent, body: string): Promise<void> {
  const settings = await getSettings(env);
  if (!settings.webhookUrl || !settings.webhookSecret) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await post(env, settings.webhookUrl, [settings.webhookSecret], event, body);
    if (result.ok) return;
    if (result.status !== null && result.status < 500 && result.status !== 429 && result.status !== 408) {
      console.warn(`webhook ${event} rejected with ${result.status}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
  }
  console.error(`webhook ${event} gave up after 3 attempts`);
}

async function queueForEndpoints(env: Env, event: string, body: string, contactId: string | null, now: number): Promise<void> {
  const { results } = await env.DB.prepare("SELECT * FROM webhook_endpoints WHERE status = 'enabled'").all<WebhookEndpointRow>();
  const targets = results.filter((row) => endpointWants(parseEvents(row.events), event));
  if (targets.length === 0) return;
  const eventId = (JSON.parse(body) as { id: string }).id;
  const deliveries = targets.map((endpoint) => ({ endpoint, id: newId("whd") }));
  await env.DB.batch(
    deliveries.map(({ endpoint, id }) =>
      env.DB.prepare(
        `INSERT INTO webhook_deliveries (id, endpoint_id, event_id, event_type, contact_id, payload, status, attempts, next_attempt_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?)`,
      ).bind(id, endpoint.id, eventId, event, contactId, body, now + CLAIM_LEASE_MS, now),
    ),
  );
  await Promise.all(deliveries.map(({ endpoint, id }) => attemptDelivery(env, endpoint, id, event, body, 0)));
}

/** A single ping to one endpoint, logged like any delivery. */
export async function sendTestEvent(env: Env, endpoint: WebhookEndpointRow): Promise<WebhookDeliveryRow | null> {
  const now = Date.now();
  const body = JSON.stringify({ id: newId("evt"), event: "ping", createdAt: now, data: {} });
  const id = newId("whd");
  await env.DB.prepare(
    `INSERT INTO webhook_deliveries (id, endpoint_id, event_id, event_type, contact_id, payload, status, attempts, next_attempt_at, created_at)
     VALUES (?, ?, ?, 'ping', NULL, ?, 'pending', 0, ?, ?)`,
  )
    .bind(id, endpoint.id, (JSON.parse(body) as { id: string }).id, body, now + CLAIM_LEASE_MS, now)
    .run();
  await attemptDelivery(env, endpoint, id, "ping", body, 0);
  return env.DB.prepare("SELECT * FROM webhook_deliveries WHERE id = ?").bind(id).first<WebhookDeliveryRow>();
}

/** Cron: retries deliveries that are due, claiming them first so two runs never send the same one. */
export async function retryDueDeliveries(env: Env): Promise<number> {
  const now = Date.now();
  const { results } = await env.DB.prepare(
    `UPDATE webhook_deliveries SET next_attempt_at = ?
     WHERE id IN (SELECT id FROM webhook_deliveries WHERE status = 'pending' AND next_attempt_at <= ? ORDER BY next_attempt_at LIMIT 50)
     RETURNING *`,
  )
    .bind(now + CLAIM_LEASE_MS, now)
    .all<WebhookDeliveryRow>();
  for (const delivery of results) {
    const endpoint = await env.DB.prepare("SELECT * FROM webhook_endpoints WHERE id = ?")
      .bind(delivery.endpoint_id)
      .first<WebhookEndpointRow>();
    if (!endpoint || endpoint.status !== "enabled") {
      await env.DB.prepare(
        "UPDATE webhook_deliveries SET status = 'failed', next_attempt_at = NULL, last_error = ?, completed_at = ? WHERE id = ?",
      )
        .bind("The endpoint is disabled", now, delivery.id)
        .run();
      continue;
    }
    await attemptDelivery(env, endpoint, delivery.id, delivery.event_type, delivery.payload, delivery.attempts);
  }
  return results.length;
}

async function attemptDelivery(
  env: Env,
  endpoint: WebhookEndpointRow,
  deliveryId: string,
  event: string,
  body: string,
  previousAttempts: number,
): Promise<void> {
  const now = Date.now();
  let result: AttemptResult;
  try {
    result = await post(env, endpoint.url, await activeSecrets(env, endpoint, now), event, body, deliveryId);
  } catch (error) {
    result = { ok: false, status: null, error: `Could not sign the delivery: ${String(error)}` };
  }
  const attempts = previousAttempts + 1;
  const done = Date.now();
  const outcome = decideAttempt(attempts, result, endpoint.failing_since ?? (result.ok ? null : done), done);
  const statusCode = result.status;
  const error = result.ok ? null : result.error.slice(0, 300);

  const statements: D1PreparedStatement[] = [];
  if (outcome.delivery === "succeeded") {
    statements.push(
      env.DB.prepare(
        `UPDATE webhook_deliveries SET status = 'succeeded', attempts = ?, next_attempt_at = NULL, last_status_code = ?,
           last_error = NULL, completed_at = ? WHERE id = ?`,
      ).bind(attempts, statusCode, done, deliveryId),
      env.DB.prepare("UPDATE webhook_endpoints SET failing_since = NULL WHERE id = ? AND failing_since IS NOT NULL").bind(endpoint.id),
    );
  } else {
    statements.push(
      outcome.delivery === "retry"
        ? env.DB.prepare(
            "UPDATE webhook_deliveries SET attempts = ?, next_attempt_at = ?, last_status_code = ?, last_error = ? WHERE id = ?",
          ).bind(attempts, outcome.nextAttemptAt, statusCode, error, deliveryId)
        : env.DB.prepare(
            `UPDATE webhook_deliveries SET status = 'failed', attempts = ?, next_attempt_at = NULL, last_status_code = ?,
               last_error = ?, completed_at = ? WHERE id = ?`,
          ).bind(attempts, statusCode, error, done, deliveryId),
      env.DB.prepare("UPDATE webhook_endpoints SET failing_since = COALESCE(failing_since, ?) WHERE id = ?").bind(done, endpoint.id),
    );
    if (outcome.disableEndpoint) {
      statements.push(
        env.DB.prepare(
          "UPDATE webhook_endpoints SET status = 'disabled', disabled_reason = ?, updated_at = ? WHERE id = ? AND status = 'enabled'",
        ).bind(outcome.disableEndpoint, done, endpoint.id),
      );
    }
  }
  await env.DB.batch(statements);
}

async function post(
  env: Env,
  url: string,
  secrets: readonly string[],
  event: string,
  body: string,
  deliveryId?: string,
): Promise<AttemptResult> {
  const signature = await signatureHeader(secrets, Date.now(), body);
  const eventId = (JSON.parse(body) as { id: string }).id;
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "yunidesk-webhooks",
        "x-yunidesk-event": event,
        "x-yunidesk-event-id": eventId,
        ...(deliveryId ? { "x-yunidesk-delivery": deliveryId } : {}),
        "x-yunidesk-signature": signature,
        ...(env.WEBHOOK_LEGACY_SIGNATURE_HEADER ? { [env.WEBHOOK_LEGACY_SIGNATURE_HEADER.toLowerCase()]: signature } : {}),
      },
      body,
      // A redirect could point anywhere (even plain http); treat it as a failure instead.
      redirect: "manual",
      signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
    });
    // Only the status matters; drain the body so the connection is released.
    await response.body?.cancel();
    if (response.status >= 200 && response.status < 300) return { ok: true, status: response.status };
    return { ok: false, status: response.status, error: `HTTP ${response.status}` };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === "TimeoutError";
    // The runtime's own message ("internal error; reference = …") means nothing to the reader.
    return { ok: false, status: null, error: timedOut ? "Timed out after 10 s" : "Could not connect (DNS, TLS or network error)" };
  }
}

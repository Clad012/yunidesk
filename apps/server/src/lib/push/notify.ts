import type { PushPayload, PushPreferences } from "yunidesk";
import type { ContactRow, ConversationRow } from "../../db/rows";
import { selectIn } from "../../db/rows";
import type { Env } from "../../env";
import { getAssistant, isAssistantReady } from "../assistant/settings";
import { inboxHub } from "../realtime";
import { buildPushRequest, classifyPushResponse, type PushOutcome, type VapidKeys } from "../web-push";
import { getVapidKeys } from "./vapid";

/** A subscription is dropped after this many failed sends in a row (429, 5xx, 403…). */
export const MAX_PUSH_FAILURES = 5;
const PREVIEW_LENGTH = 120;
const SEND_TIMEOUT_MS = 10_000;
/** How long a push service keeps a message for a device that is offline. */
const TTL_SECONDS = 24 * 3600;

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  newConversation: true,
  assignedMessage: true,
  assigned: true,
  handoff: true,
};

// Teammate-facing copy (the dashboard is English).
const TITLES = {
  newConversation: "New conversation",
  assignedMessage: "New message",
  assigned: "Conversation assigned to you",
  handoff: "A customer asked for a person",
  test: "Notifications are on",
} as const;
const BODIES = {
  attachment: "Sent an attachment",
  assignedBy: (name: string) => `Assigned to you by ${name}`,
  assigned: "Assigned to you",
  handoff: "Asked to talk to a person",
  test: "This device will be notified about your conversations.",
} as const;

export interface PushSubscriptionRow {
  id: string;
  agent_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent: string | null;
  created_at: number;
  last_success_at: number | null;
  failure_count: number;
}

export type PushEvent =
  /** A customer started a conversation (preview = their first message). */
  | { kind: "newConversation"; conversation: ConversationRow; preview: string }
  /** A customer wrote in an assigned conversation. */
  | { kind: "assignedMessage"; conversation: ConversationRow; preview: string }
  /** `actor` assigned the conversation (to `conversation.assignee_id`). */
  | { kind: "assigned"; conversation: ConversationRow; actor: { id: string; name: string } }
  /** The AI assistant handed the conversation over to the team. */
  | { kind: "handoff"; conversation: ConversationRow };

export interface PushCandidate {
  id: string;
  preferences: PushPreferences;
}

export function parsePushPreferences(raw: string | null | undefined): PushPreferences {
  let stored: Record<string, unknown> = {};
  try {
    const value = JSON.parse(raw ?? "{}") as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) stored = value as Record<string, unknown>;
  } catch {
    // keep the defaults
  }
  const out = { ...DEFAULT_PUSH_PREFERENCES };
  for (const key of Object.keys(out) as (keyof PushPreferences)[]) {
    if (typeof stored[key] === "boolean") out[key] = stored[key];
  }
  return out;
}

/**
 * Who gets a push for this event: the people it concerns, who asked for it, minus whoever caused it
 * and anyone with the dashboard open and on screen right now (they already see it).
 * `candidates` are the active human teammates who have at least one subscribed device.
 */
export function pushRecipients(event: PushEvent, candidates: PushCandidate[], visible: ReadonlySet<string>): string[] {
  const assignee = event.conversation.assignee_id;
  const actorId = event.kind === "assigned" ? event.actor.id : null;
  let concerned: (candidate: PushCandidate) => boolean;
  switch (event.kind) {
    case "newConversation":
      if (assignee) return [];
      concerned = () => true;
      break;
    case "assignedMessage":
    case "assigned":
      if (!assignee) return [];
      concerned = (c) => c.id === assignee;
      break;
    case "handoff":
      concerned = (c) => (assignee ? c.id === assignee : true);
      break;
  }
  return candidates
    .filter((c) => concerned(c) && c.preferences[event.kind] && c.id !== actorId && !visible.has(c.id))
    .map((c) => c.id);
}

/** One line of at most `PREVIEW_LENGTH` characters. */
export function shortPreview(text: string, max = PREVIEW_LENGTH): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** Only what the notification shows: who, a short preview, where to go. Never notes or internal data. */
export function pushPayload(event: PushEvent, contactName: string | null): PushPayload {
  const conversationId = event.conversation.id;
  let body: string;
  switch (event.kind) {
    case "newConversation":
    case "assignedMessage":
      body = shortPreview(event.preview) || BODIES.attachment;
      break;
    case "assigned":
      body = event.actor.name ? BODIES.assignedBy(shortPreview(event.actor.name, 60)) : BODIES.assigned;
      break;
    case "handoff":
      body = BODIES.handoff;
      break;
  }
  return {
    title: contactName ? shortPreview(contactName, 60) : TITLES[event.kind],
    body,
    tag: conversationId,
    url: `/inbox/all/${encodeURIComponent(conversationId)}`,
  };
}

export function testPayload(): PushPayload {
  return { title: TITLES.test, body: BODIES.test, tag: "yunidesk-test", url: "/settings/profile" };
}

/** VAPID `sub`: our https origin, so push services know who is sending. */
function vapidSubject(origin: string): string {
  return origin.startsWith("https://") ? origin : "mailto:webpush@localhost";
}

export interface DeliveryResult {
  outcome: PushOutcome;
  status: number | null;
}

/** Sends one message to one device and records what happened (reset, count or drop the subscription). */
export async function deliver(
  env: Env,
  vapid: VapidKeys,
  origin: string,
  subscription: PushSubscriptionRow,
  payload: PushPayload,
  urgency: "normal" | "high" = "high",
): Promise<DeliveryResult> {
  let status: number | null = null;
  try {
    const request = await buildPushRequest(subscription.endpoint, { p256dh: subscription.p256dh, auth: subscription.auth }, JSON.stringify(payload), vapid, {
      ttl: TTL_SECONDS,
      urgency,
      topic: payload.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32),
      subject: vapidSubject(origin),
    });
    // Never follow a redirect: the endpoint was checked, wherever it points to was not.
    const response = await fetch(request, { redirect: "manual", signal: AbortSignal.timeout(SEND_TIMEOUT_MS) });
    status = response.status;
    await response.body?.cancel();
  } catch (error) {
    console.warn("push: send failed", error instanceof Error ? error.message : String(error));
  }
  const outcome = status === null ? "failed" : classifyPushResponse(status);
  await recordOutcome(env, subscription, outcome);
  return { outcome, status };
}

async function recordOutcome(env: Env, subscription: PushSubscriptionRow, outcome: PushOutcome): Promise<void> {
  if (outcome === "delivered") {
    await env.DB.prepare("UPDATE push_subscriptions SET failure_count = 0, last_success_at = ? WHERE id = ?")
      .bind(Date.now(), subscription.id)
      .run();
  } else if (outcome === "gone" || subscription.failure_count + 1 >= MAX_PUSH_FAILURES) {
    await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(subscription.id).run();
  } else {
    await env.DB.prepare("UPDATE push_subscriptions SET failure_count = failure_count + 1 WHERE id = ?").bind(subscription.id).run();
  }
}

async function visibleAgentIds(env: Env): Promise<Set<string>> {
  try {
    return new Set(await inboxHub(env).visibleAgentIds());
  } catch (error) {
    console.warn("push: presence unavailable", error instanceof Error ? error.message : String(error));
    return new Set();
  }
}

/** While the AI assistant answers new conversations, the team hears about them only on handoff. */
async function assistantWillAnswer(env: Env, contact: Pick<ContactRow, "is_identified"> | null): Promise<boolean> {
  const stored = await getAssistant(env);
  return isAssistantReady(stored) && Boolean(contact) && (contact!.is_identified === 1 || stored.allowAnonymous);
}

async function dispatch(env: Env, origin: string, event: PushEvent): Promise<void> {
  const { results: agents } = await env.DB.prepare(
    `SELECT id, push_preferences FROM agents
     WHERE kind = 'human' AND disabled_at IS NULL AND id IN (SELECT agent_id FROM push_subscriptions)`,
  ).all<{ id: string; push_preferences: string }>();
  if (agents.length === 0) return;
  const candidates = agents.map((a) => ({ id: a.id, preferences: parsePushPreferences(a.push_preferences) }));
  const contact = await env.DB.prepare("SELECT name, email, is_identified FROM contacts WHERE id = ?")
    .bind(event.conversation.contact_id)
    .first<Pick<ContactRow, "name" | "email" | "is_identified">>();
  if (event.kind === "newConversation" && (await assistantWillAnswer(env, contact))) return;

  const recipients = pushRecipients(event, candidates, await visibleAgentIds(env));
  if (recipients.length === 0) return;
  const subscriptions = await selectIn<PushSubscriptionRow>(env.DB, recipients, (ph) => `SELECT * FROM push_subscriptions WHERE agent_id IN (${ph})`);
  const vapid = await getVapidKeys(env);
  const payload = pushPayload(event, contact?.name || contact?.email || null);
  await Promise.allSettled(subscriptions.map((s) => deliver(env, vapid, origin, s, payload)));
}

/** Fire and forget (call it inside `ctx.waitUntil`): a push problem never fails the request. */
export async function sendPush(env: Env, origin: string, event: PushEvent): Promise<void> {
  try {
    await dispatch(env, origin, event);
  } catch (error) {
    console.error("push: dispatch failed", error instanceof Error ? error.message : String(error));
  }
}

import { WEBHOOK_EVENT_NAMES, type WebhookEventName } from "yunidesk/webhooks";
import { copy } from "@/lib/copy";

type SubscribableEvent = Exclude<WebhookEventName, "ping">;

const LABELS: Record<SubscribableEvent, string> = {
  "conversation.created": copy.webhooks.event_created,
  "message.created": copy.webhooks.event_message,
  "conversation.updated": copy.webhooks.event_updated,
  "conversation.rated": copy.webhooks.event_rated,
  "conversation.unread_reply": copy.webhooks.event_unread,
};

/** Every event an endpoint can subscribe to, with its plain description. */
export const WEBHOOK_EVENTS: readonly { name: SubscribableEvent; label: string }[] = WEBHOOK_EVENT_NAMES.map((name) => ({ name, label: LABELS[name] }));

export function validHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

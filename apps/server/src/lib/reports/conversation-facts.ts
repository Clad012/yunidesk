import type { AuthorType, MessageKind, SystemEvent } from "yunidesk";

/**
 * The report columns on `conversations` (migration 0013) are kept up to date as messages are
 * written, so reports never scan messages. These are the rules; `factsUpdate` turns them into SQL.
 */
export interface MessageFacts {
  authorType: AuthorType;
  /** The writer's kind for team messages: API-key bots and the AI assistant are "bot". */
  agentKind: "human" | "bot" | null;
  kind: MessageKind;
  /** Written by the AI assistant. */
  ai: boolean;
  event: SystemEvent | null;
}

export interface FactsEffect {
  /** Sets first_contact_message_at when unset. */
  contactMessage: boolean;
  /** Sets human_replied, and first_human_reply_at when unset and the contact already wrote. */
  humanReply: boolean;
  /** Sets ai_involved. */
  assistant: boolean;
}

export function factsEffect(message: MessageFacts): FactsEffect {
  const text = message.kind === "text";
  return {
    contactMessage: text && message.authorType === "contact",
    humanReply: text && message.authorType === "agent" && message.agentKind === "human" && !message.ai,
    assistant: (text && message.ai) || (message.kind === "event" && message.event?.type === "handed_off"),
  };
}

/** The UPDATE that records a message's effect, or null when it changes nothing. */
export function factsUpdate(effect: FactsEffect, conversationId: string, at: number): { sql: string; values: unknown[] } | null {
  const sets: string[] = [];
  const values: unknown[] = [];
  if (effect.contactMessage) {
    sets.push("first_contact_message_at = COALESCE(first_contact_message_at, ?)");
    values.push(at);
  }
  if (effect.humanReply) {
    // Replies before the customer wrote anything (outbound) don't start the clock.
    sets.push(
      "first_human_reply_at = CASE WHEN first_human_reply_at IS NULL AND first_contact_message_at IS NOT NULL THEN ? ELSE first_human_reply_at END",
      "human_replied = 1",
    );
    values.push(at);
  }
  if (effect.assistant) sets.push("ai_involved = 1");
  if (sets.length === 0) return null;
  return { sql: `UPDATE conversations SET ${sets.join(", ")} WHERE id = ?`, values: [...values, conversationId] };
}

/**
 * SET clause for any write that moves a conversation out of "resolved" (a teammate reopening or
 * snoozing it, the customer writing again, a hand-off). SQLite evaluates it against the old row,
 * so it counts only real reopens, even when it sits next to `status = …` in the same UPDATE.
 */
export const COUNT_REOPEN_SQL = "reopened_count = reopened_count + (status = 'resolved')";

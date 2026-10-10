import { buildTimeline, type PublicAgent, type TimelineItem, type TimelineMessage } from "yunidesk";

export type ConversationRowItem =
  | TimelineItem
  | { type: "welcome"; key: "welcome" }
  | { type: "typing"; key: "typing"; agent: PublicAgent }
  | { type: "rating"; key: "rating" }
  | { type: "emailPrompt"; key: "email-prompt" };

export interface RowExtras {
  /** Everything older is loaded, so the team introduction goes on top. */
  showWelcome: boolean;
  typingAgent: PublicAgent | null;
  showRating: boolean;
  showEmailPrompt: boolean;
}

/** Rows for an inverted list: newest first, extras below the newest message. */
export function conversationRows(messages: TimelineMessage[], extras: RowExtras): ConversationRowItem[] {
  const rows: ConversationRowItem[] = [];
  if (extras.typingAgent) rows.push({ type: "typing", key: "typing", agent: extras.typingAgent });
  if (extras.showEmailPrompt) rows.push({ type: "emailPrompt", key: "email-prompt" });
  if (extras.showRating) rows.push({ type: "rating", key: "rating" });
  const timeline = buildTimeline(messages);
  for (let i = timeline.length - 1; i >= 0; i--) rows.push(timeline[i]!);
  if (extras.showWelcome) rows.push({ type: "welcome", key: "welcome" });
  return rows;
}

import { format, type ContactConversation, type SupportStrings, type WidgetConfig } from "yunidesk";

/** The teammate who answered most recently, else the team name. */
export function conversationTitle(
  conversation: ContactConversation,
  config: WidgetConfig | null,
  strings: SupportStrings,
): string {
  return conversation.participants[0]?.name ?? config?.teamName ?? strings.team;
}

export function conversationPreview(conversation: ContactConversation, strings: SupportStrings): string {
  const last = conversation.lastMessage;
  if (!last) return "";
  const body = last.body.trim().replace(/\s+/g, " ") || (last.attachmentCount > 0 ? strings.attachmentPreview : "");
  return last.authorType === "contact" ? format(strings.youPrefix, { body }) : body;
}

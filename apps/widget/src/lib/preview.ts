import { format, type ContactConversation, type SupportStrings, type WidgetConfig } from "yunidesk";

/** One-line preview of a conversation's last message ("You: …" for the contact's own). */
export function previewText(strings: SupportStrings, conversation: ContactConversation): string {
  const preview = conversation.lastMessage;
  if (!preview) return "";
  const body = preview.body.replace(/\s+/g, " ").trim() || (preview.attachmentCount > 0 ? strings.attachmentPreview : "");
  return preview.authorType === "contact" ? format(strings.youPrefix, { body }) : body;
}

/** Who the conversation is with: the last teammate who replied, else the team. */
export function conversationTitle(conversation: ContactConversation, config: WidgetConfig | null, strings: SupportStrings): string {
  return conversation.participants[0]?.name ?? config?.teamName ?? strings.team;
}

export function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first || null;
}

import { format, type ContactConversation, type PublicAgent, type SupportStrings, type WidgetConfig } from "yunidesk";

/** One-line preview of a conversation's last message ("You: …" for the contact's own). */
export function previewText(strings: SupportStrings, conversation: ContactConversation): string {
  const preview = conversation.lastMessage;
  if (!preview) return "";
  const body = preview.body.replace(/\s+/g, " ").trim() || (preview.attachmentCount > 0 ? strings.attachmentPreview : "");
  return preview.authorType === "contact" ? format(strings.youPrefix, { body }) : body;
}

/** Who the conversation is with: the last teammate who replied, else the team. */
export function conversationTitle(conversation: ContactConversation, config: WidgetConfig | null, strings: SupportStrings): string {
  const agent = conversation.participants[0];
  return agent ? participantName(agent, config, strings) : (config?.teamName ?? strings.team);
}

/** A teammate's name; the AI assistant is always marked as AI. */
export function participantName(agent: PublicAgent, config: WidgetConfig | null, strings: SupportStrings): string {
  return agent.isBot && agent.name === config?.assistant?.name ? assistantLabel(strings, config) : agent.name;
}

export function firstName(name: string | null | undefined): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first || null;
}

/** How AI messages are signed: "Acme assistant · AI", or "AI assistant" when it has no name. */
export function assistantLabel(strings: SupportStrings, config: WidgetConfig | null): string {
  const name = config?.assistant?.name?.trim();
  return name ? format(strings.aiAuthor, { name }) : strings.aiAssistant;
}

import { format, type ContactConversation, type PublicAgent, type SupportStrings, type WidgetConfig } from "yunidesk";

/** The teammate who answered most recently, else the team name. */
export function conversationTitle(
  conversation: ContactConversation,
  config: WidgetConfig | null,
  strings: SupportStrings,
): string {
  const agent = conversation.participants[0];
  return agent ? participantName(agent, config, strings) : (config?.teamName ?? strings.team);
}

/** A teammate's name; the AI assistant is always marked as AI. */
export function participantName(agent: PublicAgent, config: WidgetConfig | null, strings: SupportStrings): string {
  return agent.isBot && agent.name === config?.assistant?.name ? assistantLabel(strings, config) : agent.name;
}

export function conversationPreview(conversation: ContactConversation, strings: SupportStrings): string {
  const last = conversation.lastMessage;
  if (!last) return "";
  const body = last.body.trim().replace(/\s+/g, " ") || (last.attachmentCount > 0 ? strings.attachmentPreview : "");
  return last.authorType === "contact" ? format(strings.youPrefix, { body }) : body;
}

/** How AI messages are signed: "Acme assistant · AI", or "AI assistant" when it has no name. */
export function assistantLabel(strings: SupportStrings, config: WidgetConfig | null): string {
  const name = config?.assistant?.name?.trim();
  return name ? format(strings.aiAuthor, { name }) : strings.aiAssistant;
}

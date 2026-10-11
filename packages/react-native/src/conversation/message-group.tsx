import { memo } from "react";
import { Text, View } from "react-native";
import {
  formatClock,
  type Attachment,
  type Locale,
  type SupportStrings,
  type TimelineItem,
  type TimelineMessage,
} from "yunidesk";
import type { ResolvedTheme } from "../theme/theme";
import { AssistantAvatar } from "../ui/assistant-avatar";
import { Avatar } from "../ui/avatar";
import { MessageBubble } from "./message-bubble";
import { TalkToHuman } from "./talk-to-human";

type Group = Extract<TimelineItem, { type: "group" }>;

export interface MessageGroupProps {
  group: Group;
  theme: ResolvedTheme;
  strings: SupportStrings;
  locale: Locale;
  teamName: string;
  /** "Acme assistant · AI": the name on the assistant's messages. */
  assistantName: string;
  maxWidth: number;
  /** The contact's message the team has read, for "Seen". */
  seenId: string | null;
  /** Set while the assistant still answers: its groups offer "Talk to a human" for this conversation. */
  handoffConversationId: string | null;
  onRetry: (message: TimelineMessage) => void;
  onOpenImage: (attachment: Attachment) => void;
}

const AVATAR = 28;

function statusOf(
  message: TimelineMessage | undefined,
  seenId: string | null,
  strings: SupportStrings,
  locale: Locale,
) {
  if (!message) return null;
  if (message.delivery === "sending") return { text: strings.sending, danger: false };
  if (message.delivery === "failed") return { text: strings.sendFailed, danger: true };
  if (message.id === seenId) return { text: strings.seen, danger: false };
  return { text: formatClock(message.createdAt, locale), danger: false };
}

/**
 * A run of messages from one author: the contact's on the right in the brand colour, the team's on
 * the left with the teammate's name above the first bubble and their face beside the last.
 */
export const MessageGroup = memo(function MessageGroup({
  group,
  theme,
  strings,
  locale,
  teamName,
  assistantName,
  maxWidth,
  seenId,
  handoffConversationId,
  onRetry,
  onOpenImage,
}: MessageGroupProps) {
  const mine = group.side === "contact";
  const ai = !mine && group.messages[0]?.ai === true;
  const messages = group.messages;
  const lastMessage = messages[messages.length - 1];
  const failedIndex = messages.findIndex((m) => m.delivery === "failed");
  // Show the state of the newest message, or of an earlier one that failed (it needs the tap).
  const status = statusOf(failedIndex >= 0 ? messages[failedIndex] : lastMessage, seenId, strings, locale);
  const name = ai ? assistantName : (group.agent?.name ?? teamName);
  return (
    <View style={{ paddingHorizontal: 12, paddingVertical: 4, alignItems: mine ? "flex-end" : "flex-start" }}>
      {!mine ? (
        <Text
          style={{ color: theme.textMuted, fontSize: 13, fontWeight: "600", marginLeft: AVATAR + 16, marginBottom: 4 }}
        >
          {name}
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        {ai ? <AssistantAvatar badge={strings.aiBadge} size={AVATAR} theme={theme} /> : null}
        {!mine && !ai ? <Avatar agent={group.agent} fallbackName={teamName} size={AVATAR} theme={theme} /> : null}
        <View style={{ gap: 3, alignItems: mine ? "flex-end" : "flex-start" }}>
          {messages.map((message, index) => (
            <MessageBubble
              key={message.clientId ?? message.id}
              message={message}
              mine={mine}
              first={index === 0}
              last={index === messages.length - 1}
              theme={theme}
              strings={strings}
              maxWidth={maxWidth}
              onRetry={onRetry}
              onOpenImage={onOpenImage}
            />
          ))}
        </View>
      </View>
      {status ? (
        <Text
          style={{
            color: status.danger ? theme.danger : theme.textMuted,
            fontSize: 12,
            marginTop: 4,
            marginLeft: mine ? 0 : AVATAR + 16,
            marginRight: mine ? 4 : 0,
          }}
          accessibilityLiveRegion={status.danger ? "polite" : "none"}
        >
          {status.text}
        </Text>
      ) : null}
      {ai && handoffConversationId ? (
        <View style={{ marginLeft: AVATAR + 8 }}>
          <TalkToHuman conversationId={handoffConversationId} theme={theme} strings={strings} />
        </View>
      ) : null}
    </View>
  );
});

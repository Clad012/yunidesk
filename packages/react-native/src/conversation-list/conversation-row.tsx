import { memo } from "react";
import { Pressable, Text, View } from "react-native";
import {
  formatRelative,
  type ContactConversation,
  type Locale,
  type SupportStrings,
  type WidgetConfig,
} from "yunidesk";
import { conversationPreview, conversationTitle } from "../logic/conversation-labels";
import type { ResolvedTheme } from "../theme/theme";
import { Avatar } from "../ui/avatar";
import { UnreadBadge } from "../ui/unread-badge";

export interface ConversationRowProps {
  conversation: ContactConversation;
  config: WidgetConfig | null;
  theme: ResolvedTheme;
  strings: SupportStrings;
  locale: Locale;
  now: number;
  /** Fill behind the row; rows sit on the screen background by default. */
  background?: string;
  onPress: (conversationId: string) => void;
}

export const ConversationRow = memo(function ConversationRow({
  conversation,
  config,
  theme,
  strings,
  locale,
  now,
  background,
  onPress,
}: ConversationRowProps) {
  const title = conversationTitle(conversation, config, strings);
  const preview = conversationPreview(conversation, strings);
  const time = formatRelative(strings, conversation.lastMessageAt, now, locale);
  const unread = conversation.unreadCount > 0;
  const agent = conversation.participants[0] ?? null;
  return (
    <Pressable
      onPress={() => onPress(conversation.id)}
      accessibilityRole="button"
      accessibilityLabel={[title, preview, time].filter(Boolean).join(", ")}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 16,
        backgroundColor: pressed ? theme.surfaceStrong : (background ?? "transparent"),
      })}
    >
      <Avatar agent={agent} fallbackName={config?.teamName ?? strings.team} size={44} theme={theme} />
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
          <Text
            style={{ flex: 1, color: theme.text, fontSize: 16, fontWeight: unread ? "700" : "600" }}
            numberOfLines={1}
          >
            {title}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 13 }}>{time}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Text
            style={{
              flex: 1,
              color: unread ? theme.text : theme.textMuted,
              fontSize: 15,
              fontWeight: unread ? "600" : "400",
            }}
            numberOfLines={1}
          >
            {preview}
          </Text>
          <UnreadBadge count={conversation.unreadCount} theme={theme} strings={strings} />
        </View>
      </View>
    </Pressable>
  );
});

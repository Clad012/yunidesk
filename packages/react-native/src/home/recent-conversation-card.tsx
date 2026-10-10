import { Pressable, Text, View } from "react-native";
import type { ContactConversation, Locale, SupportStrings, WidgetConfig } from "yunidesk";
import { ConversationRow } from "../conversation-list/conversation-row";
import type { ResolvedTheme } from "../theme/theme";

export interface RecentConversationCardProps {
  conversation: ContactConversation;
  config: WidgetConfig;
  theme: ResolvedTheme;
  strings: SupportStrings;
  locale: Locale;
  now: number;
  onOpen: (conversationId: string) => void;
  onSeeAll: () => void;
}

export function RecentConversationCard({
  conversation,
  config,
  theme,
  strings,
  locale,
  now,
  onOpen,
  onSeeAll,
}: RecentConversationCardProps) {
  return (
    <View style={{ borderRadius: 18, backgroundColor: theme.surface, paddingVertical: 8, gap: 2 }}>
      <View
        style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 }}
      >
        <Text
          style={{ color: theme.text, fontSize: 15, fontWeight: "700", paddingVertical: 8 }}
          accessibilityRole="header"
        >
          {strings.recentMessage}
        </Text>
        <Pressable onPress={onSeeAll} accessibilityRole="button" hitSlop={12} style={{ paddingVertical: 8 }}>
          <Text style={{ color: theme.brand, fontSize: 15, fontWeight: "600" }}>{strings.seeAll}</Text>
        </Pressable>
      </View>
      <ConversationRow
        conversation={conversation}
        config={config}
        theme={theme}
        strings={strings}
        locale={locale}
        now={now}
        onPress={onOpen}
      />
    </View>
  );
}

import { useCallback } from "react";
import { ActivityIndicator, FlatList, Platform, View, useWindowDimensions, type ListRenderItem } from "react-native";
import type { Attachment, ContactConversation, TimelineMessage } from "yunidesk";
import { useSupportCore } from "../provider/support-context";
import { useNow } from "../ui/use-now";
import { EmailPromptCard } from "./email-prompt-card";
import { MessageGroup } from "./message-group";
import { RatingCard } from "./rating-card";
import { DaySeparator, EventRow, WelcomeRow } from "./timeline-markers";
import type { ConversationRowItem } from "./timeline-rows";
import { TypingRow } from "./typing-row";

export interface MessageListProps {
  rows: ConversationRowItem[];
  conversation: ContactConversation | null;
  seenId: string | null;
  online: boolean;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onRetry: (message: TimelineMessage) => void;
  onOpenImage: (attachment: Attachment) => void;
}

const keyExtractor = (row: ConversationRowItem) => row.key;

/** Newest at the bottom: an inverted list, so it opens at the latest message and stays there as the keyboard moves. */
export function MessageList({
  rows,
  conversation,
  seenId,
  online,
  loadingOlder,
  onLoadOlder,
  onRetry,
  onOpenImage,
}: MessageListProps) {
  const { config, theme, strings, locale } = useSupportCore();
  const { width } = useWindowDimensions();
  const now = useNow();
  const maxWidth = Math.min(520, Math.round(width * 0.74));
  const teamName = config?.teamName ?? strings.team;

  const renderItem = useCallback<ListRenderItem<ConversationRowItem>>(
    ({ item }) => {
      switch (item.type) {
        case "group":
          return (
            <MessageGroup
              group={item}
              theme={theme}
              strings={strings}
              locale={locale}
              teamName={teamName}
              maxWidth={maxWidth}
              seenId={seenId}
              onRetry={onRetry}
              onOpenImage={onOpenImage}
            />
          );
        case "day":
          return <DaySeparator at={item.at} now={now} locale={locale} theme={theme} strings={strings} />;
        case "event":
          return <EventRow message={item.message} theme={theme} strings={strings} />;
        case "typing":
          return <TypingRow agent={item.agent} teamName={teamName} theme={theme} strings={strings} />;
        case "rating":
          return conversation ? <RatingCard conversation={conversation} /> : null;
        case "emailPrompt":
          return <EmailPromptCard />;
        case "welcome":
          return config ? (
            <WelcomeRow config={config} online={online} locale={locale} theme={theme} strings={strings} />
          ) : null;
      }
    },
    [config, conversation, locale, maxWidth, now, onOpenImage, onRetry, online, seenId, strings, teamName, theme],
  );

  return (
    <FlatList
      inverted
      data={rows}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      onEndReached={onLoadOlder}
      onEndReachedThreshold={0.4}
      keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingVertical: 12 }}
      maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 80 }}
      ListFooterComponent={
        loadingOlder ? (
          <View style={{ padding: 16 }}>
            <ActivityIndicator color={theme.textMuted} accessibilityLabel={strings.loadingOlder} />
          </View>
        ) : null
      }
      initialNumToRender={16}
      windowSize={11}
      style={{ flex: 1, backgroundColor: theme.background }}
    />
  );
}

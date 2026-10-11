import { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, RefreshControl, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ContactConversation } from "yunidesk";
import { useMessengerState, useSupportCore } from "../provider/support-context";
import { Icon } from "../ui/icons";
import { LoadState } from "../ui/load-state";
import { ScreenHeader } from "../ui/screen-header";
import { useNow } from "../ui/use-now";
import { ConversationRow } from "./conversation-row";

export interface SupportConversationListProps {
  onOpenConversation: (conversationId: string) => void;
  onNewConversation: () => void;
  onBack?: () => void;
  onClose?: () => void;
  /** Show the built-in header (default true). */
  showHeader?: boolean;
  /** Pad the header for the status bar (default true). */
  safeTop?: boolean;
}

const keyExtractor = (conversation: ContactConversation) => conversation.id;

export function SupportConversationList({
  onOpenConversation,
  onNewConversation,
  onBack,
  onClose,
  showHeader = true,
  safeTop = true,
}: SupportConversationListProps) {
  const { client, config, theme, strings, locale, dispatch, activate, ready, failed, refresh } = useSupportCore();
  const { conversations } = useMessengerState();
  const insets = useSafeAreaInsets();
  const now = useNow();
  const [refreshing, setRefreshing] = useState(false);
  useEffect(activate, [activate]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { items } = await client.listConversations();
      dispatch({ type: "conversations", conversations: items });
    } catch {
      // keep what we show; the next pull retries
    } finally {
      setRefreshing(false);
    }
  }, [client, dispatch]);

  const renderItem = useCallback(
    ({ item }: { item: ContactConversation }) => (
      <ConversationRow
        conversation={item}
        config={config}
        theme={theme}
        strings={strings}
        locale={locale}
        now={now}
        onPress={onOpenConversation}
      />
    ),
    [config, theme, strings, locale, now, onOpenConversation],
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {showHeader ? (
        <ScreenHeader theme={theme} strings={strings} onBack={onBack} onClose={onClose} safeTop={safeTop}>
          <Text style={{ color: theme.text, fontSize: 17, fontWeight: "700" }} accessibilityRole="header">
            {strings.messages}
          </Text>
        </ScreenHeader>
      ) : null}
      <FlatList
        data={conversations}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: insets.bottom + 96, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textMuted} />}
        ListEmptyComponent={
          !ready ? (
            <LoadState failed={failed} theme={theme} strings={strings} onRetry={() => void refresh()} />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 6 }}>
              <Text style={{ color: theme.text, fontSize: 17, fontWeight: "700", textAlign: "center" }}>
                {strings.noConversations}
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 15, textAlign: "center" }}>
                {strings.noConversationsHint}
              </Text>
            </View>
          )
        }
      />
      <View style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 16, alignItems: "center" }}>
        <Pressable
          onPress={onNewConversation}
          accessibilityRole="button"
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 22,
            paddingVertical: 14,
            borderRadius: 999,
            backgroundColor: theme.accent,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Icon name="plus" size={14} color={theme.onAccent} weight={2.4} />
          <Text style={{ color: theme.onAccent, fontSize: 16, fontWeight: "700" }}>{strings.newConversation}</Text>
        </Pressable>
      </View>
    </View>
  );
}

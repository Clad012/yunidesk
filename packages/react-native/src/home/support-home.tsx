import { useEffect } from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMessengerState, useSupportCore } from "../provider/support-context";
import { LoadState } from "../ui/load-state";
import { useNow } from "../ui/use-now";
import { HelpCard } from "../help/help-card";
import { HomeHeader } from "./home-header";
import { RecentConversationCard } from "./recent-conversation-card";
import { SendMessageCard } from "./send-message-card";

export interface SupportHomeProps {
  /** `text`: already typed in the composer (from a Help search with no answer). */
  onNewConversation: (text?: string) => void;
  onOpenConversation: (conversationId: string) => void;
  onOpenMessages: () => void;
  /** Opens one FAQ answer. Without it the Help section is hidden. */
  onOpenArticle?: (articleId: string) => void;
  /** Shows a close button in the header. */
  onClose?: () => void;
  /** Pad the header for the status bar (default true). Turn off under a navigator header. */
  safeTop?: boolean;
}

export function SupportHome({
  onNewConversation,
  onOpenConversation,
  onOpenMessages,
  onOpenArticle,
  onClose,
  safeTop = true,
}: SupportHomeProps) {
  const { config, contact, help, theme, strings, locale, failed, activate, refresh } = useSupportCore();
  const { conversations, teamOnline } = useMessengerState();
  const insets = useSafeAreaInsets();
  const now = useNow();
  useEffect(activate, [activate]);

  if (!config) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.background, paddingTop: safeTop ? insets.top : 0 }}>
        <LoadState failed={failed} theme={theme} strings={strings} onRetry={() => void refresh()} />
      </View>
    );
  }

  const recent = conversations[0];
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      contentInsetAdjustmentBehavior="never"
    >
      <HomeHeader
        config={config}
        contact={contact}
        theme={theme}
        strings={strings}
        locale={locale}
        safeTop={safeTop}
        onClose={onClose}
      />
      <View style={{ marginTop: -36, paddingHorizontal: 16, gap: 12 }}>
        <View style={{ borderRadius: 20, backgroundColor: theme.background, padding: 4 }}>
          <SendMessageCard
            config={config}
            online={teamOnline}
            theme={theme}
            strings={strings}
            onPress={() => onNewConversation()}
          />
        </View>
        {recent ? (
          <RecentConversationCard
            conversation={recent}
            config={config}
            theme={theme}
            strings={strings}
            locale={locale}
            now={now}
            onOpen={onOpenConversation}
            onSeeAll={onOpenMessages}
          />
        ) : null}
        {onOpenArticle && help.length > 0 ? (
          <HelpCard
            articles={help}
            theme={theme}
            strings={strings}
            onOpenArticle={onOpenArticle}
            onAsk={onNewConversation}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

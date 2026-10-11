import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinkedText } from "../conversation/linked-text";
import { useSupportCore } from "../provider/support-context";
import { ScreenHeader } from "../ui/screen-header";

export interface SupportHelpArticleProps {
  /** An id from the Help section (`HelpArticle.id`). */
  articleId: string;
  /** "Ask a question" under the answer: start a new conversation. */
  onAsk: () => void;
  onBack?: () => void;
  onClose?: () => void;
  /** Pad for the status bar (default true). */
  safeTop?: boolean;
}

/** One FAQ answer, with a way to ask the team when it isn't enough. */
export function SupportHelpArticle({ articleId, onAsk, onBack, onClose, safeTop = true }: SupportHelpArticleProps) {
  const { help, config, theme, strings } = useSupportCore();
  const insets = useSafeAreaInsets();
  const article = help.find((item) => item.id === articleId) ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <ScreenHeader theme={theme} strings={strings} onBack={onBack} onClose={onClose} safeTop={safeTop}>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: "600" }} accessibilityRole="header">
          {strings.help}
        </Text>
      </ScreenHeader>
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: insets.bottom + 24 }}>
        {article ? (
          <View style={{ gap: 14 }}>
            <Text style={{ color: theme.text, fontSize: 22, fontWeight: "700", lineHeight: 28 }} accessibilityRole="header">
              {article.title}
            </Text>
            <LinkedText text={article.body} style={{ color: theme.text, fontSize: 16, lineHeight: 24 }} linkColor={theme.brand} />
          </View>
        ) : null}
        <View style={{ marginTop: 28, borderRadius: 18, backgroundColor: theme.surface, padding: 18, gap: 6 }}>
          <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>{strings.stillNeedHelp}</Text>
          <Text style={{ color: theme.textMuted, fontSize: 14 }}>
            {config?.assistant ? strings.aiAssistantIntro : strings.stillNeedHelpHint}
          </Text>
          <Pressable
            onPress={onAsk}
            accessibilityRole="button"
            style={({ pressed }) => ({
              alignSelf: "flex-start",
              marginTop: 8,
              borderRadius: 999,
              paddingHorizontal: 16,
              paddingVertical: 10,
              backgroundColor: theme.brand,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ color: theme.onBrand, fontSize: 15, fontWeight: "600" }}>{strings.askAQuestion}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

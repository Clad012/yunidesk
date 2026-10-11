import { useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { format, HELP_HOME_COUNT, searchHelp, type HelpArticle, type SupportStrings } from "yunidesk";
import type { ResolvedTheme } from "../theme/theme";
import { Icon } from "../ui/icons";
import { IconButton } from "../ui/icon-button";

export interface HelpCardProps {
  articles: HelpArticle[];
  theme: ResolvedTheme;
  strings: SupportStrings;
  onOpenArticle: (articleId: string) => void;
  /** Nothing matched: start a conversation with what was typed. */
  onAsk: (text: string) => void;
}

/** Home's Help section: search the FAQ, open an answer, or ask the team when nothing fits. */
export function HelpCard({ articles, theme, strings, onOpenArticle, onAsk }: HelpCardProps) {
  const [query, setQuery] = useState("");
  const searching = query.trim().length > 0;
  const results = useMemo(
    () => (searching ? searchHelp(articles, query) : articles.slice(0, HELP_HOME_COUNT)),
    [articles, query, searching],
  );

  return (
    <View style={{ borderRadius: 18, backgroundColor: theme.surface, paddingVertical: 8 }} accessibilityLabel={strings.help}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginHorizontal: 8,
          marginBottom: 4,
          paddingLeft: 14,
          paddingRight: 4,
          minHeight: 44,
          borderRadius: 12,
          backgroundColor: theme.surfaceStrong,
        }}
      >
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={strings.searchHelp}
          placeholderTextColor={theme.textMuted}
          accessibilityLabel={strings.searchHelp}
          returnKeyType="search"
          autoCorrect={false}
          style={{ flex: 1, color: theme.text, fontSize: 16, paddingVertical: 10 }}
        />
        {searching ? (
          <IconButton icon="close" label={strings.clearSearch} onPress={() => setQuery("")} color={theme.textMuted} />
        ) : null}
      </View>
      {results.length > 0 ? (
        results.map((article) => (
          <Pressable
            key={article.id}
            onPress={() => onOpenArticle(article.id)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              paddingHorizontal: 16,
              paddingVertical: 12,
              backgroundColor: pressed ? theme.surfaceStrong : "transparent",
            })}
          >
            <Text style={{ flex: 1, color: theme.text, fontSize: 15 }}>{article.title}</Text>
            <Icon name="forward" size={12} color={theme.accent} weight={2.2} />
          </Pressable>
        ))
      ) : (
        <View style={{ paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8, gap: 10, alignItems: "flex-start" }}>
          <Text style={{ color: theme.textMuted, fontSize: 14 }}>{format(strings.helpNoResults, { query: query.trim() })}</Text>
          <Pressable
            onPress={() => onAsk(query.trim())}
            accessibilityRole="button"
            style={({ pressed }) => ({
              borderRadius: 999,
              paddingHorizontal: 16,
              paddingVertical: 9,
              backgroundColor: theme.accent,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            <Text style={{ color: theme.onAccent, fontSize: 14, fontWeight: "600" }}>{strings.askUsInstead}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

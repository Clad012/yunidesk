import { Pressable, Text, View } from "react-native";
import { isAwayNow, replyStatusLabel, type Locale, type SupportStrings, type WidgetConfig } from "yunidesk";
import type { ResolvedTheme } from "../theme/theme";
import { Icon } from "../ui/icons";

export interface SendMessageCardProps {
  config: WidgetConfig;
  online: boolean;
  theme: ResolvedTheme;
  strings: SupportStrings;
  locale: Locale;
  now: number;
  onPress: () => void;
}

export function SendMessageCard({ config, online: teamOnline, theme, strings, locale, now, onPress }: SendMessageCardProps) {
  // Outside business hours: when the team is back, even if someone happens to be online.
  const online = teamOnline && !isAwayNow(config.availability, now);
  const status = online ? strings.online : replyStatusLabel(strings, config, now, locale);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[strings.sendUsAMessage, status, config.assistant ? strings.aiAssistantIntro : null]
        .filter(Boolean)
        .join(", ")}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        padding: 16,
        borderRadius: 18,
        backgroundColor: pressed ? theme.surfaceStrong : theme.surface,
      })}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ color: theme.text, fontSize: 16, fontWeight: "700" }}>{strings.sendUsAMessage}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {online ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: theme.online }} /> : null}
          <Text style={{ color: theme.textMuted, fontSize: 14, flexShrink: 1 }}>{status}</Text>
        </View>
        {config.assistant ? (
          <Text style={{ color: theme.textMuted, fontSize: 14 }}>{strings.aiAssistantIntro}</Text>
        ) : null}
      </View>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: theme.accent,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="forward" size={14} color={theme.onAccent} weight={2.4} />
      </View>
    </Pressable>
  );
}

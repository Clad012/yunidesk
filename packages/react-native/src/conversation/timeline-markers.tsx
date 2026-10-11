import { memo } from "react";
import { Text, View } from "react-native";
import {
  formatDayLabel,
  pickLocalized,
  replyTimeLabel,
  type Locale,
  type SupportStrings,
  type TimelineMessage,
  type WidgetConfig,
} from "yunidesk";
import type { ResolvedTheme } from "../theme/theme";
import { TeamAvatars } from "../home/team-avatars";

interface MarkerProps {
  theme: ResolvedTheme;
  strings: SupportStrings;
}

export const DaySeparator = memo(function DaySeparator({
  at,
  now,
  locale,
  theme,
  strings,
}: MarkerProps & { at: number; now: number; locale: Locale }) {
  return (
    <View style={{ alignItems: "center", paddingVertical: 12 }}>
      <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: "600" }} accessibilityRole="header">
        {formatDayLabel(strings, at, now, locale)}
      </Text>
    </View>
  );
});

/** Status changes the contact may see (resolved, reopened, handed to the team), as a small filled marker. */
export const EventRow = memo(function EventRow({
  message,
  theme,
  strings,
}: MarkerProps & { message: TimelineMessage }) {
  const event = message.event;
  const text =
    event?.type === "resolved"
      ? strings.conversationResolved
      : event?.type === "reopened"
        ? strings.conversationReopened
        : event?.type === "handed_off"
          ? strings.handedOff
          : null;
  if (!text) return null;
  return (
    <View style={{ alignItems: "center", paddingVertical: 8, paddingHorizontal: 24 }}>
      <View style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: theme.surface }}>
        <Text style={{ color: theme.textMuted, fontSize: 13, fontWeight: "600", textAlign: "center" }}>{text}</Text>
      </View>
    </View>
  );
});

/** The team's introduction at the top of a conversation. */
export const WelcomeRow = memo(function WelcomeRow({
  config,
  online,
  locale,
  theme,
  strings,
}: MarkerProps & { config: WidgetConfig; online: boolean; locale: Locale }) {
  const intro = pickLocalized(config.intro, locale) ?? strings.defaultIntro;
  return (
    <View style={{ alignItems: "center", paddingHorizontal: 32, paddingTop: 24, paddingBottom: 16, gap: 10 }}>
      <TeamAvatars agents={config.agents} theme={theme} size={36} ringColor={theme.background} />
      <Text style={{ color: theme.text, fontSize: 17, fontWeight: "700", textAlign: "center" }}>{config.teamName}</Text>
      <Text style={{ color: theme.textMuted, fontSize: 15, textAlign: "center" }}>{intro}</Text>
      <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: "center" }}>
        {online ? strings.online : replyTimeLabel(strings, config.replyTime)}
      </Text>
      {config.assistant ? (
        <Text style={{ color: theme.textMuted, fontSize: 13, textAlign: "center" }}>{strings.aiAssistantIntro}</Text>
      ) : null}
    </View>
  );
});

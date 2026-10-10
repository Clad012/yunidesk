import { memo } from "react";
import { View } from "react-native";
import { format, type PublicAgent, type SupportStrings } from "yunidesk";
import type { ResolvedTheme } from "../theme/theme";
import { Avatar } from "../ui/avatar";
import { TypingDots } from "./typing-dots";

export interface TypingRowProps {
  agent: PublicAgent;
  teamName: string;
  theme: ResolvedTheme;
  strings: SupportStrings;
}

/** "Anna is typing…": the teammate's face and a bubble of bouncing dots. */
export const TypingRow = memo(function TypingRow({ agent, teamName, theme, strings }: TypingRowProps) {
  return (
    <View
      style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingVertical: 4 }}
      accessible
      accessibilityLabel={agent.name ? format(strings.typing, { name: agent.name }) : strings.someoneTyping}
      accessibilityLiveRegion="polite"
    >
      <Avatar agent={agent} fallbackName={teamName} size={28} theme={theme} />
      <View
        style={{
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderRadius: 20,
          borderBottomLeftRadius: 6,
          backgroundColor: theme.teamBubble,
        }}
      >
        <TypingDots color={theme.textMuted} />
      </View>
    </View>
  );
});

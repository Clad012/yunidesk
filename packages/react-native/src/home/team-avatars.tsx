import { memo } from "react";
import { View } from "react-native";
import type { PublicAgent } from "yunidesk";
import type { ResolvedTheme } from "../theme/theme";
import { Avatar } from "../ui/avatar";
import { withAlpha } from "../theme/colors";

export interface TeamAvatarsProps {
  agents: PublicAgent[];
  theme: ResolvedTheme;
  size?: number;
  max?: number;
  /** The fill the faces sit on, which also separates them. Defaults to the brand colour (the home header). */
  ringColor?: string;
}

/** Overlapping teammate faces. A brand-coloured ring (a filled pad, not a border) separates them. */
export const TeamAvatars = memo(function TeamAvatars({
  agents,
  theme,
  size = 40,
  max = 3,
  ringColor,
}: TeamAvatarsProps) {
  const shown = agents.slice(0, max);
  if (shown.length === 0) return null;
  const ring = 3;
  return (
    <View style={{ flexDirection: "row" }} accessible={false} importantForAccessibility="no-hide-descendants">
      {shown.map((agent, index) => (
        <View
          key={agent.id}
          style={{
            padding: ring,
            borderRadius: (size + ring * 2) / 2,
            backgroundColor: ringColor ?? theme.brand,
            marginLeft: index === 0 ? -ring : -size * 0.3,
            zIndex: shown.length - index,
          }}
        >
          <Avatar
            agent={agent}
            size={size}
            theme={theme}
            background={ringColor ? undefined : withAlpha(theme.onBrand, 0.25)}
            textColor={ringColor ? undefined : theme.onBrand}
          />
        </View>
      ))}
    </View>
  );
});

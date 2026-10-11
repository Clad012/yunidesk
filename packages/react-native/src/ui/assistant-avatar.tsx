import { memo } from "react";
import { Text, View } from "react-native";
import type { ResolvedTheme } from "../theme/theme";

export interface AssistantAvatarProps {
  /** "AI" in the messenger's language. */
  badge: string;
  size: number;
  theme: ResolvedTheme;
}

/** The AI assistant's face: its badge on the brand colour, so it never passes for a teammate. */
export const AssistantAvatar = memo(function AssistantAvatar({ badge, size, theme }: AssistantAvatarProps) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.brand,
        alignItems: "center",
        justifyContent: "center",
      }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Text style={{ color: theme.onBrand, fontSize: size * 0.36, fontWeight: "700" }} allowFontScaling={false}>
        {badge}
      </Text>
    </View>
  );
});

import { memo } from "react";
import { Text, View } from "react-native";
import { format, type SupportStrings } from "yunidesk";
import type { ResolvedTheme } from "../theme/theme";

export interface UnreadBadgeProps {
  count: number;
  theme: ResolvedTheme;
  strings: SupportStrings;
}

export const UnreadBadge = memo(function UnreadBadge({ count, theme, strings }: UnreadBadgeProps) {
  if (count <= 0) return null;
  return (
    <View
      style={{
        minWidth: 22,
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 999,
        backgroundColor: theme.brand,
        alignItems: "center",
      }}
      accessible
      accessibilityLabel={format(strings.unreadBadge, { n: count })}
    >
      <Text style={{ color: theme.onBrand, fontSize: 12, fontWeight: "700" }}>{count > 99 ? "99+" : count}</Text>
    </View>
  );
});

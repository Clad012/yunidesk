import { memo, useState } from "react";
import { Image, Text, View, type ImageStyle, type StyleProp, type ViewStyle } from "react-native";
import type { PublicAgent } from "yunidesk";
import { initials } from "../logic/layout";
import type { ResolvedTheme } from "../theme/theme";

export interface AvatarProps {
  agent: Pick<PublicAgent, "name" | "avatarUrl"> | null;
  /** Shown when there is no agent, for example the team name. */
  fallbackName?: string;
  size: number;
  theme: ResolvedTheme;
  /** Fill behind initials; defaults to a soft brand tint. */
  background?: string;
  textColor?: string;
  style?: StyleProp<ViewStyle>;
}

export const Avatar = memo(function Avatar({
  agent,
  fallbackName,
  size,
  theme,
  background,
  textColor,
  style,
}: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const name = agent?.name ?? fallbackName ?? "";
  const url = agent?.avatarUrl;
  const box = { width: size, height: size, borderRadius: size / 2, overflow: "hidden" } satisfies ViewStyle &
    ImageStyle;
  return (
    <View
      style={[
        box,
        { backgroundColor: background ?? theme.brandSoft, alignItems: "center", justifyContent: "center" },
        style,
      ]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      {url && !broken ? (
        <Image source={{ uri: url }} style={box} onError={() => setBroken(true)} />
      ) : (
        <Text
          style={{ color: textColor ?? theme.accent, fontSize: size * 0.38, fontWeight: "600" }}
          allowFontScaling={false}
          numberOfLines={1}
        >
          {initials(name)}
        </Text>
      )}
    </View>
  );
});

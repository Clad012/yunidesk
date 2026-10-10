import { Pressable, Text } from "react-native";
import type { ResolvedTheme } from "../theme/theme";

/** One of the three rating faces, a radio button. */
export interface RatingFaceProps {
  glyph: string;
  label: string;
  selected: boolean;
  dimmed: boolean;
  disabled: boolean;
  theme: ResolvedTheme;
  onPress: () => void;
}

export function RatingFace({ glyph, label, selected, dimmed, disabled, theme, onPress }: RatingFaceProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      style={({ pressed }) => ({
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: selected ? theme.brandSoft : theme.background,
        opacity: dimmed ? 0.45 : pressed ? 0.7 : 1,
        transform: [{ scale: selected ? 1.08 : 1 }],
      })}
    >
      <Text style={{ fontSize: 32 }} allowFontScaling={false}>
        {glyph}
      </Text>
    </Pressable>
  );
}

import { memo } from "react";
import { Pressable, type StyleProp, type ViewStyle } from "react-native";
import { Icon, type IconName } from "./icons";

export interface IconButtonProps {
  icon: IconName;
  label: string;
  onPress: () => void;
  color: string;
  /** Filled circle behind the icon; transparent by default. */
  background?: string;
  size?: number;
  iconSize?: number;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A round icon button whose touch target is at least 44pt. */
export const IconButton = memo(function IconButton({
  icon,
  label,
  onPress,
  color,
  background = "transparent",
  size = 36,
  iconSize = 18,
  disabled,
  style,
}: IconButtonProps) {
  const slop = Math.max(0, (44 - size) / 2);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      hitSlop={slop}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: background,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
        },
        style,
      ]}
    >
      <Icon name={icon} size={iconSize} color={color} />
    </Pressable>
  );
});

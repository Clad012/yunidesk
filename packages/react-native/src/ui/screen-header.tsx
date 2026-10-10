import type { ReactNode } from "react";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SupportStrings } from "yunidesk";
import type { ResolvedTheme } from "../theme/theme";
import { IconButton } from "./icon-button";

export interface ScreenHeaderProps {
  theme: ResolvedTheme;
  strings: SupportStrings;
  onBack?: () => void;
  onClose?: () => void;
  /** Pad for the status bar. Off when the host's navigator already draws a header. */
  safeTop?: boolean;
  children?: ReactNode;
}

export function ScreenHeader({ theme, strings, onBack, onClose, safeTop = true, children }: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: safeTop ? insets.top : 0, backgroundColor: theme.background }}>
      <View style={{ flexDirection: "row", alignItems: "center", minHeight: 56, paddingHorizontal: 8, gap: 4 }}>
        <View style={{ width: 44, alignItems: "center" }}>
          {onBack ? <IconButton icon="back" label={strings.back} onPress={onBack} color={theme.text} /> : null}
        </View>
        <View
          style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 6 }}
        >
          {children}
        </View>
        <View style={{ width: 44, alignItems: "center" }}>
          {onClose ? <IconButton icon="close" label={strings.close} onPress={onClose} color={theme.text} /> : null}
        </View>
      </View>
    </View>
  );
}

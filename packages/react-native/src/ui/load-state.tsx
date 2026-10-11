import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { SupportStrings } from "yunidesk";
import type { ResolvedTheme } from "../theme/theme";

export interface LoadStateProps {
  failed: boolean;
  theme: ResolvedTheme;
  strings: SupportStrings;
  onRetry: () => void;
}

/** Spinner while loading; message and retry button after a failure. */
export function LoadState({ failed, theme, strings, onRetry }: LoadStateProps) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16 }}>
      {failed ? (
        <>
          <Text style={{ color: theme.text, fontSize: 16, textAlign: "center" }}>{strings.loadError}</Text>
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            style={({ pressed }) => ({
              paddingHorizontal: 20,
              paddingVertical: 12,
              borderRadius: 999,
              backgroundColor: theme.accent,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text style={{ color: theme.onAccent, fontSize: 16, fontWeight: "600" }}>{strings.retry}</Text>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator color={theme.textMuted} accessibilityLabel={strings.loading} />
      )}
    </View>
  );
}

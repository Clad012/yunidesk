import { useCallback, useState } from "react";
import { ActionSheetIOS, Modal, Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SupportStrings } from "yunidesk";
import type { ResolvedTheme } from "../theme/theme";
import type { PickSource } from "./attachment-picker";

function sourceLabel(strings: SupportStrings, source: PickSource): string {
  return source === "camera" ? strings.takePhoto : source === "library" ? strings.choosePhoto : strings.chooseFile;
}

/**
 * "Take a photo / Choose a photo / Choose a file": the system action sheet on iOS,
 * a bottom sheet of filled rows on Android. Render `sheet` once; call `open` from the attach button.
 */
export function useAttachSheet(
  theme: ResolvedTheme,
  strings: SupportStrings,
  sources: readonly PickSource[],
  onPick: (source: PickSource) => void,
) {
  const [visible, setVisible] = useState(false);

  const open = useCallback(() => {
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: [...sources.map((s) => sourceLabel(strings, s)), strings.cancel],
          cancelButtonIndex: sources.length,
          userInterfaceStyle: theme.scheme,
          tintColor: theme.accent,
        },
        (index) => {
          const source = sources[index];
          if (source) onPick(source);
        },
      );
    } else {
      setVisible(true);
    }
  }, [onPick, sources, strings, theme.accent, theme.scheme]);

  const choose = useCallback(
    (source: PickSource | null) => {
      setVisible(false);
      if (source) onPick(source);
    },
    [onPick],
  );

  const sheet =
    Platform.OS === "ios" ? null : <AndroidSheet visible={visible} theme={theme} strings={strings} sources={sources} onChoose={choose} />;
  return { open, sheet };
}

interface AndroidSheetProps {
  visible: boolean;
  theme: ResolvedTheme;
  strings: SupportStrings;
  sources: readonly PickSource[];
  onChoose: (source: PickSource | null) => void;
}

function AndroidSheet({ visible, theme, strings, sources, onChoose }: AndroidSheetProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => onChoose(null)}
    >
      <Pressable
        style={{ flex: 1, backgroundColor: theme.overlay, justifyContent: "flex-end" }}
        onPress={() => onChoose(null)}
        accessibilityRole="button"
        accessibilityLabel={strings.cancel}
      >
        <Pressable
          onPress={() => undefined}
          style={{
            backgroundColor: theme.background,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            padding: 12,
            paddingBottom: insets.bottom + 12,
            gap: 8,
          }}
        >
          {[...sources, null].map((source) => (
            <Pressable
              key={source ?? "cancel"}
              onPress={() => onChoose(source)}
              accessibilityRole="button"
              style={({ pressed }) => ({
                minHeight: 52,
                justifyContent: "center",
                paddingHorizontal: 18,
                borderRadius: 16,
                backgroundColor: pressed ? theme.surfaceStrong : theme.surface,
              })}
            >
              <Text
                style={{
                  color: source ? theme.text : theme.textMuted,
                  fontSize: 16,
                  fontWeight: source ? "600" : "500",
                }}
              >
                {source ? sourceLabel(strings, source) : strings.cancel}
              </Text>
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

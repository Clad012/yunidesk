import { memo } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import type { SupportStrings } from "yunidesk";
import type { ResolvedTheme } from "../theme/theme";
import { useHandoff } from "./use-handoff";

export interface TalkToHumanProps {
  conversationId: string;
  theme: ResolvedTheme;
  strings: SupportStrings;
}

/** Under an AI reply while the assistant answers: a filled pill that hands the conversation to a person. */
export const TalkToHuman = memo(function TalkToHuman({ conversationId, theme, strings }: TalkToHumanProps) {
  const { pending, failed, handoff } = useHandoff(conversationId);
  return (
    <View style={{ alignItems: "flex-start", gap: 6, marginTop: 6 }}>
      <Pressable
        onPress={handoff}
        disabled={pending}
        accessibilityRole="button"
        accessibilityLabel={pending ? strings.talkToHumanPending : strings.talkToHuman}
        accessibilityHint={strings.talkToHumanHint}
        accessibilityState={{ busy: pending, disabled: pending }}
        hitSlop={6}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          minHeight: 34,
          paddingHorizontal: 14,
          borderRadius: 999,
          backgroundColor: pressed ? theme.surfaceStrong : theme.surface,
        })}
      >
        {pending ? <ActivityIndicator size="small" color={theme.brand} /> : null}
        <Text style={{ color: pending ? theme.textMuted : theme.brand, fontSize: 14, fontWeight: "600" }}>
          {pending ? strings.talkToHumanPending : strings.talkToHuman}
        </Text>
      </Pressable>
      {failed ? (
        <Text style={{ color: theme.danger, fontSize: 13 }} accessibilityLiveRegion="polite" accessibilityRole="alert">
          {strings.talkToHumanFailed}
        </Text>
      ) : null}
    </View>
  );
});

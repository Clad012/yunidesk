import { memo } from "react";
import { Text, View } from "react-native";
import { format, type AssistantDraft, type SupportStrings } from "yunidesk";
import type { ResolvedTheme } from "../theme/theme";
import { AssistantAvatar } from "../ui/assistant-avatar";
import { LinkedText } from "./linked-text";
import { TypingDots } from "./typing-dots";

export interface AssistantDraftRowProps {
  draft: AssistantDraft;
  assistantName: string;
  maxWidth: number;
  theme: ResolvedTheme;
  strings: SupportStrings;
}

const AVATAR = 28;

/** The assistant's reply while it is written: bouncing dots while it thinks, then the text so far. */
export const AssistantDraftRow = memo(function AssistantDraftRow({
  draft,
  assistantName,
  maxWidth,
  theme,
  strings,
}: AssistantDraftRowProps) {
  const thinking = draft.status === "thinking" || !draft.text;
  return (
    <View
      style={{ paddingHorizontal: 12, paddingVertical: 4 }}
      accessible
      accessibilityLabel={format(strings.assistantReplying, { name: assistantName })}
    >
      <Text
        style={{ color: theme.textMuted, fontSize: 13, fontWeight: "600", marginLeft: AVATAR + 16, marginBottom: 4 }}
      >
        {assistantName}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
        <AssistantAvatar badge={strings.aiBadge} size={AVATAR} theme={theme} />
        <View
          style={{
            maxWidth,
            paddingHorizontal: 14,
            paddingVertical: thinking ? 12 : 9,
            borderRadius: 20,
            borderBottomLeftRadius: 6,
            backgroundColor: theme.brandSoft,
          }}
        >
          {thinking ? (
            <TypingDots color={theme.textMuted} />
          ) : (
            <LinkedText
              text={draft.text}
              linkColor={theme.text}
              style={{ color: theme.text, fontSize: 16, lineHeight: 22 }}
            />
          )}
        </View>
      </View>
    </View>
  );
});

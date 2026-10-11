import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MAX_MESSAGE_LENGTH, type Attachment } from "yunidesk";
import { useSupportCore } from "../provider/support-context";
import { IconButton } from "../ui/icon-button";
import { useKeyboardVisible } from "../ui/use-keyboard-visible";
import { AttachmentChips } from "./attachment-chips";
import { useAttachSheet } from "./attach-sheet";
import { useAttachments } from "./use-attachments";

export interface ComposerProps {
  /** Where typing indicators go; null (or a conversation not created yet) sends none. */
  typingConversationId: string | null;
  onSend: (body: string, attachments: Attachment[]) => void;
  /** Pad for the home indicator (default true). Off when the host already pads the bottom. */
  safeBottom?: boolean;
  /** Text already in the box when it first shows (for example what was searched in Help). */
  initialText?: string;
}

export function Composer({ typingConversationId, onSend, safeBottom = true, initialText = "" }: ComposerProps) {
  const { client, theme, strings, attachmentPicker } = useSupportCore();
  const insets = useSafeAreaInsets();
  const keyboardVisible = useKeyboardVisible();
  const [text, setText] = useState(initialText);
  const files = useAttachments();
  const sheet = useAttachSheet(theme, strings, attachmentPicker?.sources ?? [], files.pick);

  const input = useRef<TextInput>(null);
  const typingId = useRef(typingConversationId);
  typingId.current = typingConversationId;
  const stopTyping = useCallback(() => {
    if (typingId.current) client.sendTyping(typingId.current, false);
  }, [client]);
  useEffect(() => stopTyping, [stopTyping, typingConversationId]);

  const onChangeText = useCallback(
    (value: string) => {
      setText(value);
      if (!typingId.current) return;
      if (value.trim()) client.sendTyping(typingId.current, true);
      else client.sendTyping(typingId.current, false);
    },
    [client],
  );

  const body = text.trim();
  const canSend = !files.busy && (body.length > 0 || files.uploaded.length > 0);
  const send = useCallback(() => {
    if (!canSend) return;
    stopTyping();
    onSend(body, files.uploaded);
    // Clear the native field too: on iOS a pending autocorrect suggestion is otherwise
    // committed back into the box right after the state is emptied.
    input.current?.clear();
    setText("");
    files.clear();
  }, [body, canSend, files, onSend, stopTyping]);

  return (
    <View
      style={{
        backgroundColor: theme.background,
        paddingBottom: safeBottom && !keyboardVisible ? Math.max(insets.bottom, 8) : 8,
      }}
    >
      {files.notice ? (
        <View
          style={{ marginHorizontal: 12, marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: theme.surface }}
        >
          <Text
            style={{ color: theme.danger, fontSize: 14 }}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
          >
            {files.notice}
          </Text>
        </View>
      ) : null}
      <AttachmentChips
        drafts={files.drafts}
        theme={theme}
        strings={strings}
        onRemove={files.remove}
        onRetry={files.retry}
      />
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 8 }}>
        {attachmentPicker && attachmentPicker.sources.length > 0 ? (
          <IconButton
            icon="plus"
            label={strings.attach}
            onPress={sheet.open}
            color={theme.text}
            background={theme.surface}
            size={40}
          />
        ) : null}
        <View
          style={{
            flex: 1,
            borderRadius: 20,
            backgroundColor: theme.surface,
            paddingHorizontal: 14,
            justifyContent: "center",
            minHeight: 40,
          }}
        >
          <TextInput
            ref={input}
            value={text}
            onChangeText={onChangeText}
            onBlur={stopTyping}
            placeholder={strings.composerPlaceholder}
            placeholderTextColor={theme.textMuted}
            accessibilityLabel={strings.composerPlaceholder}
            multiline
            maxLength={MAX_MESSAGE_LENGTH}
            keyboardAppearance={theme.scheme}
            selectionColor={theme.accent}
            cursorColor={theme.accent}
            textAlignVertical="center"
            style={{
              color: theme.text,
              fontSize: 16,
              maxHeight: 140,
              // iOS adds no inner padding to a multiline field; Android adds its own.
              paddingTop: Platform.OS === "ios" ? 10 : 8,
              paddingBottom: Platform.OS === "ios" ? 10 : 8,
            }}
          />
        </View>
        <IconButton
          icon="arrowUp"
          label={strings.send}
          onPress={send}
          disabled={!canSend}
          color={canSend ? theme.onAccent : theme.textMuted}
          background={canSend ? theme.accent : theme.surface}
          size={40}
        />
      </View>
      {sheet.sheet}
    </View>
  );
}

import { memo } from "react";
import { Image, Pressable, ScrollView, Text, View } from "react-native";
import { isInlineImage, type SupportStrings } from "yunidesk";
import type { ResolvedTheme } from "../theme/theme";
import { withAlpha } from "../theme/colors";
import { IconButton } from "../ui/icon-button";
import type { DraftAttachment } from "./use-attachments";

export interface AttachmentChipsProps {
  drafts: DraftAttachment[];
  theme: ResolvedTheme;
  strings: SupportStrings;
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
}

const SIZE = 64;

export const AttachmentChips = memo(function AttachmentChips({
  drafts,
  theme,
  strings,
  onRemove,
  onRetry,
}: AttachmentChipsProps) {
  if (drafts.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ gap: 8, paddingHorizontal: 12, paddingTop: 10 }}
    >
      {drafts.map((draft) => (
        <Chip key={draft.key} draft={draft} theme={theme} strings={strings} onRemove={onRemove} onRetry={onRetry} />
      ))}
    </ScrollView>
  );
});

interface ChipProps extends Omit<AttachmentChipsProps, "drafts"> {
  draft: DraftAttachment;
}

function Chip({ draft, theme, strings, onRemove, onRetry }: ChipProps) {
  const { file, status, progress } = draft;
  const image = isInlineImage(file.type) || file.type.startsWith("image/");
  const failed = status === "failed";
  const label = failed
    ? `${file.name}, ${strings.uploadFailed}, ${strings.retry}`
    : status === "uploading"
      ? `${file.name}, ${strings.uploading}`
      : file.name;
  return (
    <View style={{ paddingTop: 6, paddingRight: 6 }}>
      <Pressable
        onPress={failed ? () => onRetry(draft.key) : undefined}
        disabled={!failed}
        accessibilityRole={failed ? "button" : "image"}
        accessibilityLabel={label}
        style={{
          width: image ? SIZE : 148,
          height: SIZE,
          borderRadius: 14,
          overflow: "hidden",
          backgroundColor: failed ? withAlpha(theme.danger, 0.16) : theme.surfaceStrong,
          justifyContent: "center",
        }}
      >
        {image ? (
          <Image source={{ uri: file.uri }} style={{ width: SIZE, height: SIZE, opacity: failed ? 0.4 : 1 }} />
        ) : (
          <Text style={{ color: theme.text, fontSize: 13, fontWeight: "600", paddingHorizontal: 10 }} numberOfLines={2}>
            {file.name}
          </Text>
        )}
        {status === "uploading" ? (
          <View
            style={{
              position: "absolute",
              left: 6,
              right: 6,
              bottom: 6,
              height: 4,
              borderRadius: 2,
              backgroundColor: withAlpha("#000000", 0.25),
            }}
          >
            <View
              style={{
                width: `${Math.max(6, Math.round(progress * 100))}%`,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.brand,
              }}
            />
          </View>
        ) : null}
        {failed ? (
          <Text
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 4,
              textAlign: "center",
              color: theme.danger,
              fontSize: 11,
              fontWeight: "700",
            }}
          >
            {strings.retry}
          </Text>
        ) : null}
      </Pressable>
      <IconButton
        icon="close"
        label={`${strings.removeAttachment}, ${file.name}`}
        onPress={() => onRemove(draft.key)}
        color={theme.background}
        background={theme.text}
        size={22}
        iconSize={10}
        style={{ position: "absolute", top: 0, right: 0 }}
      />
    </View>
  );
}

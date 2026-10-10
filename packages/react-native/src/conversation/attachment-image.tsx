import { memo, useState } from "react";
import { Image, Pressable } from "react-native";
import type { Attachment, SupportStrings } from "yunidesk";
import { fitImage } from "../logic/layout";
import type { ResolvedTheme } from "../theme/theme";

// Natural sizes learnt on load, so recycled rows don't jump back to a square.
const learntSizes = new Map<string, { width: number; height: number }>();

export interface AttachmentImageProps {
  attachment: Attachment;
  maxWidth: number;
  theme: ResolvedTheme;
  strings: SupportStrings;
  radius: number;
  onOpen: (attachment: Attachment) => void;
}

export const AttachmentImage = memo(function AttachmentImage({
  attachment,
  maxWidth,
  theme,
  strings,
  radius,
  onOpen,
}: AttachmentImageProps) {
  const [learnt, setLearnt] = useState(() => learntSizes.get(attachment.id) ?? null);
  const size = fitImage(
    attachment.width ?? learnt?.width ?? null,
    attachment.height ?? learnt?.height ?? null,
    maxWidth,
    maxWidth * 1.25,
  );
  return (
    <Pressable
      onPress={() => onOpen(attachment)}
      accessibilityRole="imagebutton"
      accessibilityLabel={`${strings.openImage}, ${attachment.fileName}`}
      style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
    >
      <Image
        source={{ uri: attachment.url }}
        style={{ width: size.width, height: size.height, borderRadius: radius, backgroundColor: theme.surfaceStrong }}
        resizeMode="cover"
        onLoad={(event) => {
          if (attachment.width && attachment.height) return;
          const { width, height } = event.nativeEvent.source;
          if (!width || !height) return;
          learntSizes.set(attachment.id, { width, height });
          setLearnt({ width, height });
        }}
      />
    </Pressable>
  );
});

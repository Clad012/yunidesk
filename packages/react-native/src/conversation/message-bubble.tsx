import { memo } from "react";
import { Pressable, View, type ViewStyle } from "react-native";
import type { Attachment, SupportStrings, TimelineMessage } from "yunidesk";
import type { ResolvedTheme } from "../theme/theme";
import { AttachmentFile } from "./attachment-file";
import { AttachmentImage } from "./attachment-image";
import { LinkedText } from "./linked-text";

export interface MessageBubbleProps {
  message: TimelineMessage;
  mine: boolean;
  /** Position in its group, for the tighter inner corners. */
  first: boolean;
  last: boolean;
  theme: ResolvedTheme;
  strings: SupportStrings;
  maxWidth: number;
  onRetry: (message: TimelineMessage) => void;
  onOpenImage: (attachment: Attachment) => void;
}

const RADIUS = 20;
const INNER = 6;

function corners(mine: boolean, first: boolean, last: boolean): ViewStyle {
  return mine
    ? {
        borderRadius: RADIUS,
        borderTopRightRadius: first ? RADIUS : INNER,
        borderBottomRightRadius: last ? RADIUS : INNER,
      }
    : {
        borderRadius: RADIUS,
        borderTopLeftRadius: first ? RADIUS : INNER,
        borderBottomLeftRadius: last ? RADIUS : INNER,
      };
}

/** One message: its images, file tiles and text, in the author's colours. Failed sends retry on tap. */
export const MessageBubble = memo(function MessageBubble({
  message,
  mine,
  first,
  last,
  theme,
  strings,
  maxWidth,
  onRetry,
  onOpenImage,
}: MessageBubbleProps) {
  const failed = message.delivery === "failed";
  const background = mine ? theme.brand : theme.teamBubble;
  const textColor = mine ? theme.onBrand : theme.teamBubbleText;
  const images = message.attachments.filter((a) => a.isImage);
  const files = message.attachments.filter((a) => !a.isImage);
  const shape = corners(mine, first, last);
  return (
    <Pressable
      onPress={failed ? () => onRetry(message) : undefined}
      disabled={!failed}
      accessibilityRole={failed ? "button" : undefined}
      accessibilityHint={failed ? strings.sendFailed : undefined}
      style={{
        alignItems: mine ? "flex-end" : "flex-start",
        gap: 4,
        opacity: message.delivery === "sending" ? 0.7 : failed ? 0.55 : 1,
      }}
    >
      {images.map((attachment) => (
        <AttachmentImage
          key={attachment.id}
          attachment={attachment}
          maxWidth={maxWidth}
          theme={theme}
          strings={strings}
          radius={RADIUS}
          onOpen={onOpenImage}
        />
      ))}
      {files.map((attachment) => (
        <AttachmentFile
          key={attachment.id}
          attachment={attachment}
          background={background}
          textColor={textColor}
          strings={strings}
          maxWidth={maxWidth}
        />
      ))}
      {message.body ? (
        <View style={[shape, { backgroundColor: background, maxWidth, paddingHorizontal: 14, paddingVertical: 9 }]}>
          <LinkedText
            text={message.body}
            linkColor={textColor}
            style={{ color: textColor, fontSize: 16, lineHeight: 22 }}
          />
        </View>
      ) : null}
    </Pressable>
  );
});

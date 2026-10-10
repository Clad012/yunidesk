import { memo } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { formatBytes, type Attachment, type SupportStrings } from "yunidesk";
import { withAlpha } from "../theme/colors";

export interface AttachmentFileProps {
  attachment: Attachment;
  /** Fill and text colours of the bubble it sits in. */
  background: string;
  textColor: string;
  strings: SupportStrings;
  maxWidth: number;
}

function extension(name: string): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(name);
  return (match?.[1] ?? "file").toUpperCase();
}

/** A file as a filled tile; tapping opens the signed link (the system shows or downloads it). */
export const AttachmentFile = memo(function AttachmentFile({
  attachment,
  background,
  textColor,
  strings,
  maxWidth,
}: AttachmentFileProps) {
  return (
    <Pressable
      onPress={() => Linking.openURL(attachment.url).catch(() => undefined)}
      accessibilityRole="link"
      accessibilityLabel={`${strings.download}, ${attachment.fileName}, ${formatBytes(attachment.size)}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        padding: 10,
        maxWidth,
        minHeight: 56,
        borderRadius: 16,
        backgroundColor: background,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: withAlpha(textColor, 0.14),
        }}
      >
        <Text style={{ color: textColor, fontSize: 10, fontWeight: "800" }} allowFontScaling={false}>
          {extension(attachment.fileName)}
        </Text>
      </View>
      <View style={{ flexShrink: 1, gap: 2 }}>
        <Text style={{ color: textColor, fontSize: 15, fontWeight: "600" }} numberOfLines={1} ellipsizeMode="middle">
          {attachment.fileName}
        </Text>
        <Text style={{ color: withAlpha(textColor, 0.7), fontSize: 13 }}>{formatBytes(attachment.size)}</Text>
      </View>
    </Pressable>
  );
});

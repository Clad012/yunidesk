import { memo, useMemo } from "react";
import { Linking, Text, type StyleProp, type TextStyle } from "react-native";
import { splitLinks } from "../logic/links";

export interface LinkedTextProps {
  text: string;
  style: StyleProp<TextStyle>;
  linkColor: string;
}

function openUrl(url: string) {
  Linking.openURL(url).catch(() => undefined);
}

/** Message text with tappable links. Selectable on long press. */
export const LinkedText = memo(function LinkedText({ text, style, linkColor }: LinkedTextProps) {
  const segments = useMemo(() => splitLinks(text), [text]);
  return (
    <Text style={style} selectable>
      {segments.map((segment, index) =>
        segment.type === "link" ? (
          <Text
            key={index}
            style={{ color: linkColor, textDecorationLine: "underline" }}
            onPress={() => openUrl(segment.url)}
            accessibilityRole="link"
          >
            {segment.text}
          </Text>
        ) : (
          segment.text
        ),
      )}
    </Text>
  );
});

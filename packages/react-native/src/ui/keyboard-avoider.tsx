import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { KeyboardAvoidingView, Platform, View, type StyleProp, type ViewStyle } from "react-native";

export interface KeyboardAvoiderProps {
  /** Extra offset on top of the measured one, for chrome the SDK cannot see. */
  extraOffset?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/**
 * KeyboardAvoidingView compares the keyboard's screen position with its own layout frame, which is
 * relative to its parent. Under a navigator header or inside an iOS page sheet that frame does not
 * start at the top of the screen, so we measure where we really are and pass it as the offset.
 */
export function KeyboardAvoider({ extraOffset = 0, style, children }: KeyboardAvoiderProps) {
  const ref = useRef<View>(null);
  const [top, setTop] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const measureNow = useCallback(() => {
    ref.current?.measureInWindow((_x, y) => {
      if (Number.isFinite(y)) setTop((current) => (Math.abs(current - y) > 0.5 ? y : current));
    });
  }, []);
  // Measure again once a sheet or push animation has settled; mid-animation positions are wrong.
  const measure = useCallback(() => {
    measureNow();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(measureNow, 450);
  }, [measureNow]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return (
    <View ref={ref} style={[{ flex: 1 }, style]} onLayout={measure} collapsable={false}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        // iOS: pad above the keyboard. Android 15+ apps are edge to edge, so the window no longer
        // resizes for the keyboard; shrinking the view's height keeps the composer above it.
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={top + extraOffset}
      >
        {children}
      </KeyboardAvoidingView>
    </View>
  );
}

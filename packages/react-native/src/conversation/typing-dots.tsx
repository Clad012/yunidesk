import { memo, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, View } from "react-native";

export interface TypingDotsProps {
  color: string;
  size?: number;
}

/** Three dots that bounce in turn, on the native driver. Still when the user asks for less motion. */
export const TypingDots = memo(function TypingDots({ color, size = 7 }: TypingDotsProps) {
  const values = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => mounted && setReduceMotion(enabled))
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) return;
    const step = (value: Animated.Value) =>
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: 280, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: 280, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]);
    const loop = Animated.loop(Animated.sequence([Animated.stagger(140, values.map(step)), Animated.delay(240)]));
    loop.start();
    return () => {
      loop.stop();
      values.forEach((value) => value.setValue(0));
    };
  }, [reduceMotion, values]);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: size * 0.6, height: size * 2.4 }}>
      {values.map((value, index) => (
        <Animated.View
          key={index}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: color,
            opacity: value.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }),
            transform: [{ translateY: value.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.5] }) }],
          }}
        />
      ))}
    </View>
  );
});

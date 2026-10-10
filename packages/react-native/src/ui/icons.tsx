import { memo } from "react";
import { View } from "react-native";

// Icons drawn from rounded bars, so the SDK needs no icon library.
// Each bar is given in a 0..1 box: centre (x, y), length and angle in degrees.

interface Bar {
  x: number;
  y: number;
  length: number;
  angle: number;
}

const D = Math.SQRT1_2 * 0.25; // offset of a 45° arm of length 0.5 from its tip

const SHAPES = {
  close: [
    { x: 0.5, y: 0.5, length: 0.82, angle: 45 },
    { x: 0.5, y: 0.5, length: 0.82, angle: -45 },
  ],
  plus: [
    { x: 0.5, y: 0.5, length: 0.8, angle: 0 },
    { x: 0.5, y: 0.5, length: 0.8, angle: 90 },
  ],
  back: [
    { x: 0.32 + D, y: 0.5 - D, length: 0.5, angle: -45 },
    { x: 0.32 + D, y: 0.5 + D, length: 0.5, angle: 45 },
  ],
  forward: [
    { x: 0.68 - D, y: 0.5 - D, length: 0.5, angle: 45 },
    { x: 0.68 - D, y: 0.5 + D, length: 0.5, angle: -45 },
  ],
  arrowUp: [
    { x: 0.5, y: 0.54, length: 0.72, angle: 90 },
    { x: 0.5 - D, y: 0.18 + D, length: 0.5, angle: -45 },
    { x: 0.5 + D, y: 0.18 + D, length: 0.5, angle: 45 },
  ],
} satisfies Record<string, Bar[]>;

export type IconName = keyof typeof SHAPES;

export interface IconProps {
  name: IconName;
  size?: number;
  color: string;
  /** Stroke width in points. */
  weight?: number;
}

export const Icon = memo(function Icon({ name, size = 20, color, weight = 2 }: IconProps) {
  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      {SHAPES[name].map((bar, index) => {
        const length = bar.length * size;
        return (
          <View
            key={index}
            style={{
              position: "absolute",
              width: length,
              height: weight,
              borderRadius: weight / 2,
              backgroundColor: color,
              left: bar.x * size - length / 2,
              top: bar.y * size - weight / 2,
              transform: [{ rotate: `${bar.angle}deg` }],
            }}
          />
        );
      })}
    </View>
  );
});

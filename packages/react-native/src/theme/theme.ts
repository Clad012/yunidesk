import { parseHexColor, readableTextColor, withAlpha } from "./colors";

export interface SupportPalette {
  /** Screen background. */
  background: string;
  /** Filled blocks (cards, rows, composer field). */
  surface: string;
  /** A stronger fill, for blocks on top of `surface`. */
  surfaceStrong: string;
  text: string;
  textMuted: string;
  /** Teammate bubbles. */
  teamBubble: string;
  teamBubbleText: string;
  danger: string;
  online: string;
  /** Behind sheets and the image viewer. */
  overlay: string;
}

export interface SupportTheme {
  /** Overrides the brand colour set in the dashboard. Hex, for example "#4F46E5". */
  brandColor?: string;
  light?: Partial<SupportPalette>;
  dark?: Partial<SupportPalette>;
}

export interface ResolvedTheme extends SupportPalette {
  scheme: "light" | "dark";
  brand: string;
  /** Text and icons drawn on the brand colour. */
  onBrand: string;
  /** A light tint of the brand colour, for soft fills. */
  brandSoft: string;
}

const LIGHT: SupportPalette = {
  background: "#FFFFFF",
  surface: "#F3F4F6",
  surfaceStrong: "#E5E7EB",
  text: "#111827",
  textMuted: "#6B7280",
  teamBubble: "#F3F4F6",
  teamBubbleText: "#111827",
  danger: "#DC2626",
  online: "#16A34A",
  overlay: "rgba(0, 0, 0, 0.4)",
};

const DARK: SupportPalette = {
  background: "#0B0B0F",
  surface: "#1C1C22",
  surfaceStrong: "#2A2A32",
  text: "#F4F4F5",
  textMuted: "#A1A1AA",
  teamBubble: "#1C1C22",
  teamBubbleText: "#F4F4F5",
  danger: "#F87171",
  online: "#22C55E",
  overlay: "rgba(0, 0, 0, 0.6)",
};

export const FALLBACK_BRAND = "#4F46E5";

export function resolveTheme(
  scheme: "light" | "dark",
  serverBrand: string | null | undefined,
  overrides: SupportTheme | undefined,
): ResolvedTheme {
  const base = scheme === "dark" ? DARK : LIGHT;
  const palette = { ...base, ...(scheme === "dark" ? overrides?.dark : overrides?.light) };
  const brand =
    [overrides?.brandColor, serverBrand].find((c): c is string => !!c && parseHexColor(c) !== null) ?? FALLBACK_BRAND;
  return {
    ...palette,
    scheme,
    brand,
    onBrand: readableTextColor(brand),
    brandSoft: withAlpha(brand, scheme === "dark" ? 0.22 : 0.12),
  };
}

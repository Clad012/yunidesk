// Colour maths for the brand colour that comes from the server: parse it, and pick a text
// colour that stays readable on top of it (WCAG relative luminance and contrast ratio).

export type Rgb = readonly [number, number, number];

export function parseHexColor(input: string): Rgb | null {
  const hex = input.trim().replace(/^#/, "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return null;
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as unknown as Rgb;
}

export function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [light, dark] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

export const LIGHT_TEXT = "#FFFFFF";
export const DARK_TEXT = "#0B0B0F";

/** White or near-black, whichever reads better on `background`. Unparseable colours get white. */
export function readableTextColor(background: string): string {
  const rgb = parseHexColor(background);
  if (!rgb) return LIGHT_TEXT;
  const light = contrastRatio(rgb, parseHexColor(LIGHT_TEXT)!);
  const dark = contrastRatio(rgb, parseHexColor(DARK_TEXT)!);
  return light >= dark ? LIGHT_TEXT : DARK_TEXT;
}

/** `rgba()` for a hex colour; returns the input unchanged if it is not hex. */
export function withAlpha(color: string, alpha: number): string {
  const rgb = parseHexColor(color);
  if (!rgb) return color;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

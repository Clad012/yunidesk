// Brand colour helpers: any colour the team picks must stay readable.

export type Rgb = readonly [number, number, number];

const FALLBACK: Rgb = [109, 93, 252];
const WHITE: Rgb = [255, 255, 255];
const NEAR_BLACK: Rgb = [17, 17, 24];
const DARK_SURFACE: Rgb = [24, 24, 30];

/** Accepts #rgb and #rrggbb; anything else is null. */
export function parseHex(input: string): Rgb | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(input.trim());
  if (!match) return null;
  let hex = match[1]!;
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
  const n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG relative luminance. */
export function luminance([r, g, b]: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** White or near-black, whichever reads better on `background`. */
export function textOn(background: Rgb): Rgb {
  return contrastRatio(background, WHITE) >= contrastRatio(background, NEAR_BLACK) ? WHITE : NEAR_BLACK;
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/**
 * The brand colour pushed towards `toward` until it reaches `min` contrast on `surface`,
 * for brand-coloured text and icons (a pale yellow brand becomes a dark amber on white).
 */
export function inkOn(brand: Rgb, surface: Rgb, min = 4.5): Rgb {
  if (contrastRatio(brand, surface) >= min) return brand;
  const toward = luminance(surface) > 0.5 ? NEAR_BLACK : WHITE;
  for (let t = 0.05; t <= 1; t += 0.05) {
    const candidate = mix(brand, toward, t);
    if (contrastRatio(candidate, surface) >= min) return candidate;
  }
  return toward;
}

export interface BrandTheme {
  brand: string;
  onBrand: string;
  /** The gradient's second stop for the home header. */
  brandDeep: string;
  inkLight: string;
  inkDark: string;
}

export function brandTheme(input: string): BrandTheme {
  const brand = parseHex(input) ?? FALLBACK;
  const fg = textOn(brand);
  const deep = mix(brand, fg === WHITE ? NEAR_BLACK : WHITE, 0.28);
  return {
    brand: toHex(brand),
    onBrand: toHex(fg),
    brandDeep: toHex(deep),
    inkLight: toHex(inkOn(brand, WHITE)),
    inkDark: toHex(inkOn(brand, DARK_SURFACE)),
  };
}

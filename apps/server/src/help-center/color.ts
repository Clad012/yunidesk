// The brand colour as the help center uses it: readable as text on light and dark pages.

type Rgb = readonly [number, number, number];

const FALLBACK: Rgb = [109, 93, 252];
const WHITE: Rgb = [255, 255, 255];
const NEAR_BLACK: Rgb = [17, 17, 24];
const DARK_SURFACE: Rgb = [20, 20, 26];

function parseHex(input: string): Rgb | null {
  const match = /^#([0-9a-f]{6})$/i.exec(input.trim());
  if (!match) return null;
  const n = parseInt(match[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("")}`;
}

function luminance([r, g, b]: Rgb): number {
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

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

function inkOn(brand: Rgb, surface: Rgb): Rgb {
  if (contrastRatio(brand, surface) >= 4.5) return brand;
  const toward = luminance(surface) > 0.5 ? NEAR_BLACK : WHITE;
  for (let t = 0.05; t <= 1; t += 0.05) {
    const candidate = mix(brand, toward, t);
    if (contrastRatio(candidate, surface) >= 4.5) return candidate;
  }
  return toward;
}

export interface HelpCenterColors {
  brand: string;
  onBrand: string;
  inkLight: string;
  inkDark: string;
}

/** Hex values only (validated), so they are safe to put in the page's CSS. */
export function helpCenterColors(input: string): HelpCenterColors {
  const brand = parseHex(input) ?? FALLBACK;
  const onBrand = contrastRatio(brand, WHITE) >= contrastRatio(brand, NEAR_BLACK) ? WHITE : NEAR_BLACK;
  return { brand: toHex(brand), onBrand: toHex(onBrand), inkLight: toHex(inkOn(brand, WHITE)), inkDark: toHex(inkOn(brand, DARK_SURFACE)) };
}

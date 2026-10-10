// Small layout helpers kept pure for testing.

/** Fits an image into a box, keeping its aspect ratio. Unknown sizes show as a square. */
export function fitImage(
  width: number | null,
  height: number | null,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (!width || !height || width <= 0 || height <= 0) {
    const side = Math.min(maxWidth, maxHeight);
    return { width: side, height: side };
  }
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);
  // Very thin images still get a tappable size.
  return { width: Math.max(48, Math.round(width * scale)), height: Math.max(48, Math.round(height * scale)) };
}

export function initials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = Array.from(words[0]!)[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1]!)[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function firstName(name: string | null | undefined): string | null {
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first ? first : null;
}

export type TextSegment = { type: "text"; text: string } | { type: "link"; text: string; href: string };

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
const TRAILING = /[.,;:!?)\]}'"]+$/;

/** Splits plain text into text and link runs. Only http(s) links are produced. */
export function linkify(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    let raw = match[0];
    // Keep closing punctuation out of the link, unless it balances an opening paren inside it.
    const trail = TRAILING.exec(raw)?.[0] ?? "";
    let cut = trail.length;
    if (trail.startsWith(")") && raw.slice(0, raw.length - cut).includes("(")) cut -= 1;
    raw = raw.slice(0, raw.length - cut);
    if (!raw || /^(?:https?:\/\/|www\.)$/i.test(raw)) continue;
    if (start > last) segments.push({ type: "text", text: text.slice(last, start) });
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    segments.push({ type: "link", text: raw, href });
    last = start + raw.length;
  }
  if (last < text.length) segments.push({ type: "text", text: text.slice(last) });
  return segments;
}

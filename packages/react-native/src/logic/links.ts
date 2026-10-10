// Splits message text into plain and link segments so links can be tapped.

export type TextSegment = { type: "text"; text: string } | { type: "link"; text: string; url: string };

const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?'")\]}]+$/;

export function splitLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    let raw = match[0];
    // "see https://x.com/a." — the full stop belongs to the sentence. Keep a closing
    // parenthesis when the link itself opened one, as in Wikipedia URLs.
    const trailing = TRAILING_PUNCTUATION.exec(raw)?.[0] ?? "";
    if (trailing) {
      let keep = 0;
      if (trailing.startsWith(")") && count(raw, "(") > count(raw.slice(0, -trailing.length), ")")) keep = 1;
      raw = raw.slice(0, raw.length - trailing.length + keep);
    }
    if (!raw) continue;
    if (start > cursor) segments.push({ type: "text", text: text.slice(cursor, start) });
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    segments.push({ type: "link", text: raw, url });
    cursor = start + raw.length;
  }
  if (cursor < text.length) segments.push({ type: "text", text: text.slice(cursor) });
  return segments;
}

function count(value: string, char: string): number {
  return value.split(char).length - 1;
}

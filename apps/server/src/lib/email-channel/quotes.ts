// Keeps the new part of an email reply: drops the quoted history mail clients append and the
// signature, so the conversation reads like a chat. The whole email stays available ("Show full
// email"), so when in doubt we keep text rather than cut it.

const SPACE = "[\\s\\u00a0]";
/** "On Mon, 13 Oct 2026 at 10:02, Ana <ana@example.com> wrote:" */
const WROTE_EN = new RegExp(`^${SPACE}*On${SPACE}.{4,}${SPACE}wrote${SPACE}*:${SPACE}*$`, "i");
/** "Le lun. 13 oct. 2026 à 10:02, Ana <ana@example.com> a écrit :" */
const WROTE_FR = new RegExp(`^${SPACE}*Le${SPACE}.{4,}${SPACE}a${SPACE}+écrit${SPACE}*:${SPACE}*$`, "i");
const STARTS_ATTRIBUTION = new RegExp(`^${SPACE}*(On|Le)${SPACE}`, "i");
/** "-----Original Message-----", "-----Message d'origine-----", "---------- Forwarded message ---------" */
const SEPARATOR = /^\s*-{2,}\s*(original message|message d'origine|forwarded message|message transféré)\s*-{2,}\s*$/i;
const UNDERSCORES = /^\s*_{10,}\s*$/;
/** Outlook's quoted header block: "From: …" then "Sent:", "To:", "Subject:" (or "De :", "Envoyé :", "À :", "Objet :"). */
const HEADER_FROM = /^\s*\**(From|De)\s?:\**\s*\S/i;
const HEADER_FIELD = /^\s*\**(Sent|Date|To|Cc|Subject|Envoyé|À|A|Objet)\s?:\**\s*\S/i;
const SIGNATURE = /^-- $/;
const SIGNATURE_LOOSE = /^--\s*$/;
const MOBILE_FOOTER = /^\s*(Sent from my .{2,60}|Sent from .{2,30} for (iOS|Android)|Get Outlook for .{2,30}|Envoyé (de|depuis) mon .{2,60}|Obtenir Outlook pour .{2,30})\s*$/i;

function isAttribution(lines: string[], i: number): boolean {
  const line = lines[i]!;
  if (WROTE_EN.test(line) || WROTE_FR.test(line)) return true;
  // Clients wrap long attribution lines: "On Mon, 13 Oct 2026, Ana Lopez <" / "ana@example.com> wrote:"
  if (!STARTS_ATTRIBUTION.test(line)) return false;
  for (let extra = 1; extra <= 2 && i + extra < lines.length; extra++) {
    const joined = lines.slice(i, i + extra + 1).join(" ");
    if (joined.length > 300) return false;
    if (WROTE_EN.test(joined) || WROTE_FR.test(joined)) return true;
  }
  return false;
}

function isHeaderBlock(lines: string[], i: number): boolean {
  if (!HEADER_FROM.test(lines[i]!)) return false;
  let fields = 0;
  for (let j = i + 1; j < Math.min(lines.length, i + 7); j++) if (HEADER_FIELD.test(lines[j]!)) fields++;
  return fields >= 2;
}

function nextNonBlank(lines: string[], i: number): number {
  let j = i + 1;
  while (j < lines.length && !lines[j]!.trim()) j++;
  return j;
}

/** The first line of a block of ">" lines that runs to the end of the email (an interleaved answer is kept). */
function trailingQuoteStart(lines: string[]): number {
  let start = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!.trim();
    if (!line) continue;
    if (line.startsWith(">")) start = i;
    else break;
  }
  return start;
}

function cutIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (isAttribution(lines, i) || SEPARATOR.test(line) || isHeaderBlock(lines, i)) return i;
    if (UNDERSCORES.test(line) && HEADER_FROM.test(lines[nextNonBlank(lines, i)] ?? "")) return i;
    if (SIGNATURE.test(line)) return i;
    // A bare "--" is a signature only when little follows it (some people use it as a divider).
    if (SIGNATURE_LOOSE.test(line) && lines.length - i <= 8) return i;
  }
  const quote = trailingQuoteStart(lines);
  return quote >= 0 ? quote : lines.length;
}

function tidy(lines: string[]): string {
  return lines
    .map((l) => l.replace(/[ \t ]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface StrippedReply {
  /** The new part of the email. */
  text: string;
  /** True when something (quote, signature) was removed. */
  stripped: boolean;
}

export function stripQuotedReply(input: string): StrippedReply {
  // Trailing spaces matter until the cut: "-- " (with its space) is the signature delimiter.
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const full = tidy(lines);
  const kept = lines.slice(0, cutIndex(lines));
  while (kept.length && !kept[kept.length - 1]!.trim()) kept.pop();
  if (kept.length && MOBILE_FOOTER.test(kept[kept.length - 1]!)) kept.pop();
  const text = tidy(kept);
  // Everything was quote (or the answer was written below it): keep the whole email rather than nothing.
  if (!text) return { text: full, stripped: false };
  return { text, stripped: text !== full };
}

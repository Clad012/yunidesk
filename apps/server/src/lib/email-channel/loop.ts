import type { MailHeader } from "./auth-results";

// Mail that no person wrote: out-of-office replies, bounces, mailing lists. Answering them (or
// letting them open conversations) is how two robots end up emailing each other forever.

const BULK_PRECEDENCE = new Set(["bulk", "list", "junk", "auto_reply"]);
const AUTO_REPLY_HEADERS = ["x-autoreply", "x-autorespond", "x-autoresponder", "x-auto-reply"];
const BOUNCE_SENDERS = /^(mailer-daemon|postmaster)@/i;

/** Why this email was written by a machine, or null when it looks like a person wrote it. */
export function automatedReason(headers: readonly MailHeader[], envelopeFrom: string): string | null {
  const from = envelopeFrom.trim().replace(/^<|>$/g, "");
  if (!from) return "bounce";
  if (BOUNCE_SENDERS.test(from)) return "bounce";
  for (const { key, value } of headers) {
    const v = value.trim().toLowerCase();
    if (key === "auto-submitted" && v && !v.startsWith("no")) return "auto-submitted";
    if (AUTO_REPLY_HEADERS.includes(key)) return "auto-reply";
    if ((key === "precedence" || key === "x-precedence") && BULK_PRECEDENCE.has(v)) return `precedence ${v}`;
    if (key === "content-type" && v.startsWith("multipart/report")) return "delivery report";
  }
  return null;
}

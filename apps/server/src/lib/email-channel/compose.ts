import type { Locale } from "yunidesk";
import { EMAIL_COPY, fill } from "./copy";

// A team reply as an email: who it's from, the threading headers mail clients group by, and a
// text + simple HTML body. Pure, so tests check exactly what goes out.

export interface OutboundEmail {
  from: { email: string; name: string };
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
  /** Our Message-ID, without angle brackets (providers that let us set it send it as the header). */
  messageId: string;
  /** In-Reply-To and References, when the conversation has earlier emails. */
  headers: Record<string, string>;
}

export interface ReplyInput {
  body: string;
  attachments: { fileName: string; url: string }[];
  agentName: string;
  /** "<agent> via <senderName>": the from name in settings, or the team name. */
  senderName: string;
  teamName: string;
  fromAddress: string;
  to: string;
  replyTo: string;
  subject: string | null;
  brandColor: string;
  locale: Locale;
  /** Message-IDs of the conversation's emails so far, oldest first; the last inbound one is replied to. */
  thread: string[];
  inReplyTo: string | null;
  /** Unique part of our Message-ID (the message id plus randomness). */
  messageIdLocal: string;
}

/** Header-safe display name: no line breaks, quotes or angle brackets. */
export function displayName(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f"<>\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 78);
}

const REPLY_PREFIX = /^(re|aw|sv|antw|réf|ref|rif|tr|fw|fwd)\s*(\[\d+\])?\s*:/i;

export function replySubject(subject: string | null, fallback: string): string {
  const clean = (subject ?? "").replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  if (!clean) return `Re: ${fallback}`;
  return /^re\s*(\[\d+\])?\s*:/i.test(clean) ? clean : `Re: ${clean.replace(REPLY_PREFIX, "").trim() || fallback}`;
}

/** References: the whole thread when it fits, else the first email and as many recent ones as fit. */
export function referencesHeader(ids: readonly string[], maxLength = 1900): string {
  const unique = [...new Set(ids)].map((id) => `<${id}>`);
  if (unique.join(" ").length <= maxLength) return unique.join(" ");
  const [first, ...rest] = unique;
  const tail: string[] = [];
  let length = first!.length;
  for (let i = rest.length - 1; i >= 0; i--) {
    if (length + 1 + rest[i]!.length > maxLength) break;
    tail.unshift(rest[i]!);
    length += 1 + rest[i]!.length;
  }
  return [first!, ...tail].join(" ");
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

export function composeReply(input: ReplyInput): OutboundEmail {
  const copy = EMAIL_COPY[input.locale];
  const team = displayName(input.teamName) || "Support";
  const fromDomain = input.fromAddress.slice(input.fromAddress.lastIndexOf("@") + 1);
  const messageId = `${input.messageIdLocal}@${fromDomain}`;
  const color = /^#[0-9a-fA-F]{6}$/.test(input.brandColor) ? input.brandColor : "#6d5dfc";
  const footer = fill(copy.footer, { team });

  const headers: Record<string, string> = {};
  if (input.inReplyTo) headers["In-Reply-To"] = `<${input.inReplyTo}>`;
  if (input.thread.length) headers["References"] = referencesHeader(input.thread);

  const attachmentText = input.attachments.length
    ? ["", copy.attachments, ...input.attachments.map((a) => `- ${a.fileName}: ${a.url}`)]
    : [];
  const text = [input.body, ...attachmentText, "", "-- ", footer].join("\n");

  const paragraphs = escapeHtml(input.body).replace(/\r?\n/g, "<br>");
  const attachmentHtml = input.attachments.length
    ? `<p style="margin:16px 0 0;font-size:14px;color:#555">${escapeHtml(copy.attachments)}</p><ul style="margin:4px 0 0;padding-left:20px;font-size:14px">${input.attachments
        .map((a) => `<li><a href="${escapeHtml(a.url)}" style="color:${color}">${escapeHtml(a.fileName)}</a></li>`)
        .join("")}</ul>`
    : "";
  const html = [
    "<!doctype html>",
    '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>',
    '<body style="margin:0;padding:24px 12px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif;color:#1d1d1f">',
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;border-top:4px solid ${color};padding:24px">`,
    `<div style="font-size:15px;line-height:1.55">${paragraphs}</div>`,
    attachmentHtml,
    `<p style="margin:24px 0 0;font-size:12px;color:#86868b">${escapeHtml(footer)}</p>`,
    "</div></body></html>",
  ].join("");

  return {
    from: { email: input.fromAddress, name: displayName(`${input.agentName} via ${input.senderName}`) },
    to: input.to,
    replyTo: input.replyTo,
    subject: replySubject(input.subject, fill(copy.noSubject, { team })),
    text,
    html,
    messageId,
    headers,
  };
}

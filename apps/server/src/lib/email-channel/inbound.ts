import PostalMime, { type Email } from "postal-mime";
import { MAX_ATTACHMENTS_PER_MESSAGE, MAX_MESSAGE_LENGTH, type EmailAuthentication } from "yunidesk";
import type { Env } from "../../env";
import { createConversation, postMessage, type InsertOptions } from "../../db/conversations";
import type { ContactRow, ConversationRow } from "../../db/rows";
import { selectIn } from "../../db/rows";
import { ApiError } from "../errors";
import { newId } from "../ids";
import { storeAttachment } from "../uploads";
import {
  conversationFromReplyAddress,
  domainOf,
  isReplyAddress,
  normalizeAddress,
  normalizeMessageId,
  parseMessageIdList,
} from "./addresses";
import { readAuthentication, type MailHeader } from "./auth-results";
import { detectLocale } from "./copy";
import { htmlToText } from "./html-text";
import { automatedReason } from "./loop";
import { stripQuotedReply } from "./quotes";
import { loadEmailConfig, type EmailConfig } from "./settings";
import { acceptsThread, threadLookupIds, type ThreadCandidate } from "./threading";

export const MAX_EMAIL_BYTES = 10 * 1024 * 1024;
/** Emails one sender may send per hour before we refuse more. */
export const SENDER_LIMIT_PER_HOUR = 20;
const MAX_ORIGINAL_CHARS = 200_000;
/** Inline images smaller than this are logos and signature icons, not screenshots. */
const MIN_INLINE_IMAGE_BYTES = 10 * 1024;
const HOUR_MS = 3600_000;

export type InboundOutcome =
  | { outcome: "created" | "appended"; conversationId: string; verified: boolean }
  | { outcome: "ignored"; reason: string }
  | { outcome: "rejected"; reason: string };

/** Cloudflare Email Routing → this worker's `email()` handler. */
export async function handleInboundEmail(message: ForwardableEmailMessage, env: Env, ctx: ExecutionContext): Promise<InboundOutcome> {
  const config = await loadEmailConfig(env);
  const done = (result: InboundOutcome) => {
    if (result.outcome === "rejected") message.setReject(result.reason);
    console.log("inbound email", result.outcome, "reason" in result ? result.reason : result.conversationId);
    return result;
  };
  if (!config.enabled || !config.inboundAddress || !config.replyDomain) {
    return done({ outcome: "rejected", reason: "This address does not accept email" });
  }
  if (message.rawSize > MAX_EMAIL_BYTES) return done({ outcome: "rejected", reason: "Message too large: the limit is 10 MB" });

  const recipient = normalizeAddress(message.to);
  let tokenConversation: string | null = null;
  if (recipient && recipient !== config.inboundAddress) {
    if (!isReplyAddress(recipient) || domainOf(recipient) !== config.replyDomain) {
      return done({ outcome: "rejected", reason: "Unknown address" });
    }
    // A wrong or tampered token still delivers, as a new conversation.
    tokenConversation = await conversationFromReplyAddress(env.SESSION_SECRET, recipient, config.replyDomain);
  }
  if (!recipient) return done({ outcome: "rejected", reason: "Unknown address" });

  try {
    const raw = await new Response(message.raw).arrayBuffer();
    const parsed = await PostalMime.parse(raw, { attachmentEncoding: "arraybuffer" });
    const origin = (env.PUBLIC_URL ?? "").replace(/\/+$/, "");
    return done(
      await ingestEmail(env, ctx, origin, config, {
        parsed,
        envelopeFrom: message.from,
        to: recipient,
        tokenConversation,
        hasPlainPart: hasPlainTextPart(raw),
      }),
    );
  } catch (error) {
    console.error("inbound email failed", error);
    return done({ outcome: "rejected", reason: "The message could not be processed" });
  }
}

/** Whether the email has its own text/plain part (else postal-mime's text is converted from HTML, and we convert it ourselves). */
export function hasPlainTextPart(raw: ArrayBuffer): boolean {
  const head = new TextDecoder("latin1").decode(raw.slice(0, 256 * 1024));
  if (!/^content-type\s*:/im.test(head)) return true;
  return /^content-type\s*:\s*text\/plain/im.test(head);
}

interface InboundEmail {
  parsed: Email;
  envelopeFrom: string;
  to: string;
  tokenConversation: string | null;
  hasPlainPart: boolean;
}

function senderOf(parsed: Email): { address: string | null; name: string | null } {
  const from = parsed.from;
  const mailbox = from?.group ? from.group[0] : from;
  const name = mailbox?.name?.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 80) || null;
  return { address: mailbox?.address ?? null, name };
}

function bodyText(parsed: Email, hasPlainPart: boolean): string {
  if (hasPlainPart && parsed.text?.trim()) return parsed.text;
  if (parsed.html) return htmlToText(parsed.html);
  return parsed.text ?? "";
}

async function findThread(env: Env, email: InboundEmail): Promise<(ThreadCandidate & { conversation: ConversationRow }) | null> {
  let conversationId = email.tokenConversation;
  let via: ThreadCandidate["via"] = "token";
  if (!conversationId) {
    const ids = threadLookupIds(parseMessageIdList(email.parsed.inReplyTo), parseMessageIdList(email.parsed.references));
    if (ids.length === 0) return null;
    const rows = await selectIn<{ conversation_id: string; email_message_id: string }>(
      env.DB,
      ids,
      (ph) => `SELECT conversation_id, email_message_id FROM messages WHERE email_message_id IN (${ph})`,
    );
    const byId = new Map(rows.map((r) => [r.email_message_id, r.conversation_id]));
    conversationId = ids.map((id) => byId.get(id)).find((id): id is string => Boolean(id)) ?? null;
    via = "headers";
  }
  if (!conversationId) return null;
  const conversation = await env.DB.prepare("SELECT * FROM conversations WHERE id = ? AND channel = 'email'")
    .bind(conversationId)
    .first<ConversationRow>();
  if (!conversation) return null;
  const contact = await env.DB.prepare("SELECT email, external_id FROM contacts WHERE id = ?")
    .bind(conversation.contact_id)
    .first<Pick<ContactRow, "email" | "external_id">>();
  return contact ? { conversationId, via, contact, conversation } : null;
}

/**
 * The contact a new email conversation belongs to. A verified sender joins the contact who already
 * proved this address (identified by your app, or verified by an earlier email); an unverified one
 * only ever joins an earlier unverified email contact, so a forged From can't land in someone's history.
 */
async function resolveContact(env: Env, address: string, rawAddress: string, name: string | null, verified: boolean): Promise<string> {
  const variants = [address, rawAddress.trim()];
  const existing = verified
    ? await env.DB.prepare(
        `SELECT id FROM contacts WHERE email IN (?, ?) AND email_verified_at IS NOT NULL
         ORDER BY is_identified DESC, COALESCE(last_seen_at, created_at) DESC LIMIT 1`,
      )
        .bind(...variants)
        .first<{ id: string }>()
    : await env.DB.prepare(
        `SELECT id FROM contacts WHERE email IN (?, ?) AND external_id IS NULL AND is_identified = 0
           AND email_verified_at IS NULL AND last_channel = 'email'
         ORDER BY created_at DESC LIMIT 1`,
      )
        .bind(...variants)
        .first<{ id: string }>();
  const now = Date.now();
  if (existing) {
    await env.DB.prepare("UPDATE contacts SET last_seen_at = ?, name = COALESCE(name, ?) WHERE id = ?").bind(now, name, existing.id).run();
    return existing.id;
  }
  const id = newId("ctc");
  await env.DB.prepare(
    `INSERT INTO contacts (id, email, email_verified_at, name, attributes, is_identified, last_channel, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, '{}', 0, 'email', ?, ?)`,
  )
    .bind(id, address, verified ? now : null, name, now, now)
    .run();
  return id;
}

async function storeAttachments(env: Env, parsed: Email, contactId: string): Promise<{ ids: string[]; skipped: string[] }> {
  const ids: string[] = [];
  const skipped: string[] = [];
  for (const attachment of parsed.attachments) {
    const name = attachment.filename || `${attachment.mimeType.replace("/", ".")}`;
    const bytes = attachment.content instanceof ArrayBuffer ? new Uint8Array(attachment.content) : typeof attachment.content === "string" ? new TextEncoder().encode(attachment.content) : attachment.content;
    const inline = attachment.related || (attachment.disposition === "inline" && attachment.contentId);
    if (inline && bytes.byteLength < MIN_INLINE_IMAGE_BYTES) continue;
    if (ids.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
      skipped.push(name);
      continue;
    }
    try {
      const row = await storeAttachment(env, bytes, name, attachment.mimeType, { type: "contact", id: contactId });
      ids.push(row.id);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      skipped.push(name);
    }
  }
  return { ids, skipped };
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export async function ingestEmail(env: Env, ctx: ExecutionContext, origin: string, config: EmailConfig, email: InboundEmail): Promise<InboundOutcome> {
  const { parsed } = email;
  const headers: MailHeader[] = parsed.headers;
  const from = senderOf(parsed);
  const sender = normalizeAddress(from.address);
  if (!sender) return { outcome: "ignored", reason: "no sender address" };

  const automated = automatedReason(headers, email.envelopeFrom);
  if (automated) return { outcome: "ignored", reason: automated };
  if (sender === config.inboundAddress || sender === config.fromAddress || isReplyAddress(sender)) {
    return { outcome: "ignored", reason: "sent from our own address" };
  }
  const messageId = normalizeMessageId(parsed.messageId);
  if (messageId) {
    const seen = await env.DB.prepare("SELECT email_direction FROM messages WHERE email_message_id = ? LIMIT 1")
      .bind(messageId)
      .first<{ email_direction: string }>();
    if (seen) return { outcome: "ignored", reason: seen.email_direction === "outbound" ? "our own email" : "duplicate" };
  }

  const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM email_originals WHERE from_address = ? AND created_at > ?")
    .bind(sender, Date.now() - HOUR_MS)
    .first<{ n: number }>();
  if ((recent?.n ?? 0) >= SENDER_LIMIT_PER_HOUR) {
    return { outcome: "rejected", reason: "Too many messages from this address, try again later" };
  }

  const auth: EmailAuthentication = readAuthentication(headers, domainOf(sender), config.authservId);
  const thread = await findThread(env, email);
  const continued = thread && acceptsThread(thread, sender, auth.verified) ? thread : null;
  const contactId = continued?.conversation.contact_id ?? (await resolveContact(env, sender, from.address ?? sender, from.name, auth.verified));

  const full = clip(bodyText(parsed, email.hasPlainPart).trim(), MAX_ORIGINAL_CHARS);
  const subject = parsed.subject?.replace(/[\r\n\t]+/g, " ").trim().slice(0, 300) || null;
  const attachments = await storeAttachments(env, parsed, contactId);
  const body = clip(stripQuotedReply(full).text, MAX_MESSAGE_LENGTH) || (attachments.ids.length ? "" : (subject ?? "(no text)"));

  const options: InsertOptions = {
    email: { messageId, inReplyTo: parseMessageIdList(parsed.inReplyTo)[0] ?? null, verified: auth.verified },
    extraStatements: (id) => [
      env.DB.prepare(
        `INSERT INTO email_originals (message_id, from_address, from_name, to_address, subject, sent_at, text, authentication, skipped_attachments, locale, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        id,
        sender,
        from.name,
        email.to,
        subject,
        parsed.date ?? null,
        full,
        JSON.stringify({ spf: auth.spf, dkim: auth.dkim, dmarc: auth.dmarc }),
        attachments.skipped.length ? JSON.stringify(attachments.skipped.slice(0, 50)) : null,
        detectLocale(headers, full),
        Date.now(),
      ),
    ],
  };
  const draft = { body, attachmentIds: attachments.ids, clientId: null };

  if (continued) {
    await postMessage(env, ctx, origin, continued.conversation, { type: "contact", contactId }, "text", draft, options);
    await env.DB.prepare("UPDATE contacts SET last_seen_at = ? WHERE id = ?").bind(Date.now(), contactId).run();
    return { outcome: "appended", conversationId: continued.conversationId, verified: auth.verified };
  }
  const { conversation } = await createConversation(env, ctx, origin, contactId, "email", draft, { ...options, subject });
  return { outcome: "created", conversationId: conversation.id, verified: auth.verified };
}

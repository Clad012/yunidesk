import type { EmailProvider, EmailTestResult, Locale } from "yunidesk";
import type { Env } from "../../env";
import { getConversation, postSystemEvent } from "../../db/conversations";
import type { AgentRow, AttachmentRow, ContactRow, ConversationRow, MessageRow } from "../../db/rows";
import { randomToken } from "../crypto";
import { getSettings, type StoredSettings } from "../settings";
import { signFilePath } from "../tokens";
import { normalizeMessageId, replyAddress } from "./addresses";
import { composeReply, type OutboundEmail } from "./compose";
import { EMAIL_COPY, fill } from "./copy";
import { loadEmailConfig, transportFor, type EmailConfig } from "./settings";
import { EmailSendError } from "./transport";

// Team replies in email conversations are queued on the message itself (email_status = 'pending')
// and sent right away; failures are retried by the every-minute cron with backoff, and after the
// last try the team sees an "Email not delivered" marker in the conversation.

export const EMAIL_MAX_ATTEMPTS = 6;
const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3600_000, 6 * 3600_000];
/** While one worker sends, others leave the message alone for this long. */
const LEASE_MS = 5 * 60_000;
/** Attachment links in emails stay valid this long. */
const EMAIL_LINK_LIFETIME_MS = 30 * 24 * 3600_000;

export type AttemptOutcome = { status: "pending"; nextAttemptAt: number } | { status: "failed" };

/** After the `attempts`-th failed try: retry later, or give up (permanent errors give up at once). */
export function nextEmailAttempt(attempts: number, permanent: boolean, now: number): AttemptOutcome {
  if (permanent || attempts >= EMAIL_MAX_ATTEMPTS) return { status: "failed" };
  const delay = RETRY_DELAYS_MS[Math.min(Math.max(attempts, 1), RETRY_DELAYS_MS.length) - 1]!;
  return { status: "pending", nextAttemptAt: now + delay };
}

class NotSendable extends EmailSendError {
  constructor(message: string) {
    super(message, true);
  }
}

async function buildReply(
  env: Env,
  origin: string,
  row: MessageRow,
  conversation: ConversationRow,
  config: EmailConfig,
  settings: StoredSettings,
): Promise<OutboundEmail> {
  if (!config.inboundAddress || !config.replyDomain || !config.fromAddress) {
    throw new NotSendable("Set the inbound and from addresses in Settings → Email");
  }
  const contact = await env.DB.prepare("SELECT * FROM contacts WHERE id = ?").bind(conversation.contact_id).first<ContactRow>();
  if (!contact?.email) throw new NotSendable("The customer has no email address");
  const agent = row.agent_id
    ? await env.DB.prepare("SELECT * FROM agents WHERE id = ?").bind(row.agent_id).first<AgentRow>()
    : null;

  const [thread, original, attachments] = await Promise.all([
    env.DB.prepare(
      `SELECT email_message_id, email_direction FROM messages
       WHERE conversation_id = ? AND email_message_id IS NOT NULL AND created_at <= ? AND id != ?
       ORDER BY created_at DESC LIMIT 100`,
    )
      .bind(conversation.id, row.created_at, row.id)
      .all<Pick<MessageRow, "email_message_id" | "email_direction">>(),
    env.DB.prepare(
      `SELECT o.locale FROM email_originals o JOIN messages m ON m.id = o.message_id
       WHERE m.conversation_id = ? ORDER BY o.created_at DESC LIMIT 1`,
    )
      .bind(conversation.id)
      .first<{ locale: string | null }>(),
    env.DB.prepare("SELECT * FROM attachments WHERE message_id = ? ORDER BY created_at").bind(row.id).all<AttachmentRow>(),
  ]);
  const ordered = thread.results.reverse();
  const lastInbound = [...ordered].reverse().find((m) => m.email_direction === "inbound");
  const now = Date.now();
  const links = await Promise.all(
    attachments.results.map(async (a) => ({
      fileName: a.file_name,
      url: origin + (await signFilePath(env.SESSION_SECRET, a.id, now, EMAIL_LINK_LIFETIME_MS)),
    })),
  );
  return composeReply({
    body: row.body,
    attachments: links,
    agentName: agent?.name ?? settings.teamName,
    senderName: config.fromName ?? settings.teamName,
    teamName: settings.teamName,
    fromAddress: config.fromAddress,
    to: contact.email,
    replyTo: await replyAddress(env.SESSION_SECRET, conversation.id, config.replyDomain),
    subject: conversation.subject,
    brandColor: settings.brandColor,
    locale: original?.locale === "fr" ? "fr" : "en",
    thread: ordered.map((m) => m.email_message_id!),
    inReplyTo: lastInbound?.email_message_id ?? null,
    messageIdLocal: `${row.id}.${randomToken(6)}`,
  });
}

/** Sends one queued reply. Safe to call twice: only the caller that claims the message sends it. */
export async function deliverEmailReply(env: Env, ctx: ExecutionContext, origin: string, messageId: string): Promise<void> {
  const now = Date.now();
  const row = await env.DB.prepare(
    `UPDATE messages SET email_attempts = email_attempts + 1, email_next_attempt_at = ?
     WHERE id = ? AND email_status = 'pending' AND email_next_attempt_at <= ? RETURNING *`,
  )
    .bind(now + LEASE_MS, messageId, now)
    .first<MessageRow>();
  if (!row) return;

  let conversation: ConversationRow;
  try {
    conversation = await getConversation(env, row.conversation_id);
  } catch {
    return;
  }
  try {
    const [config, settings] = await Promise.all([loadEmailConfig(env), getSettings(env)]);
    if (!config.enabled) throw new NotSendable("The email channel is turned off");
    const transport = transportFor(env, config.provider);
    if (!transport) throw new NotSendable("No email provider is configured");
    const email = await buildReply(env, origin, row, conversation, config, settings);
    const sent = await transport.send(email);
    await env.DB.prepare(
      `UPDATE messages SET email_status = 'sent', email_message_id = ?, email_error = NULL, email_next_attempt_at = NULL
       WHERE id = ?`,
    )
      .bind(normalizeMessageId(sent.messageId) ?? email.messageId, row.id)
      .run();
  } catch (error) {
    const permanent = error instanceof EmailSendError ? error.permanent : false;
    const reason = (error instanceof Error ? error.message : String(error)).slice(0, 300);
    if (!(error instanceof EmailSendError)) console.error("email reply failed", error);
    const outcome = nextEmailAttempt(row.email_attempts, permanent, Date.now());
    if (outcome.status === "pending") {
      await env.DB.prepare("UPDATE messages SET email_error = ?, email_next_attempt_at = ? WHERE id = ?")
        .bind(reason, outcome.nextAttemptAt, row.id)
        .run();
      return;
    }
    await env.DB.prepare(
      "UPDATE messages SET email_status = 'failed', email_error = ?, email_next_attempt_at = NULL WHERE id = ?",
    )
      .bind(reason, row.id)
      .run();
    await postSystemEvent(env, ctx, origin, conversation, { type: "email_failed", agentName: null, messageId: row.id, reason });
  }
}

/** Every-minute cron: replies whose retry time has come. */
export async function retryDueEmails(env: Env, ctx: ExecutionContext, origin: string): Promise<number> {
  const { results } = await env.DB.prepare(
    "SELECT id FROM messages WHERE email_status = 'pending' AND email_next_attempt_at <= ? ORDER BY email_next_attempt_at LIMIT 25",
  )
    .bind(Date.now())
    .all<{ id: string }>();
  for (const { id } of results) await deliverEmailReply(env, ctx, origin, id);
  return results.length;
}

/** Settings → Email "Send a test email", to the teammate who asked. */
export async function sendTestEmail(env: Env, to: string, locale: Locale = "en"): Promise<EmailTestResult> {
  const [config, settings] = await Promise.all([loadEmailConfig(env), getSettings(env)]);
  const provider: EmailProvider | null = config.provider;
  const transport = transportFor(env, provider);
  if (!transport) return { ok: false, provider, to, error: "No email provider is configured" };
  if (!config.fromAddress) return { ok: false, provider, to, error: "Set a from address first" };
  const copy = EMAIL_COPY[locale];
  const email = composeReply({
    body: fill(copy.testBody, { team: settings.teamName }),
    attachments: [],
    agentName: settings.teamName,
    senderName: config.fromName ?? settings.teamName,
    teamName: settings.teamName,
    fromAddress: config.fromAddress,
    to,
    replyTo: config.inboundAddress ?? config.fromAddress,
    subject: null,
    brandColor: settings.brandColor,
    locale,
    thread: [],
    inReplyTo: null,
    messageIdLocal: `test.${randomToken(9)}`,
  });
  try {
    await transport.send({ ...email, subject: fill(copy.testSubject, { team: settings.teamName }) });
    return { ok: true, provider, to, error: null };
  } catch (error) {
    return { ok: false, provider, to, error: (error instanceof Error ? error.message : String(error)).slice(0, 300) };
  }
}

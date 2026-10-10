import type { Env } from "../env";
import type { ContactRow, ConversationRow } from "../db/rows";
import { getSettings } from "../lib/settings";
import { sendWebhook } from "../lib/webhooks";
import { sendEmail } from "../lib/email";

/**
 * Runs a couple of minutes after a teammate replies. For each conversation where the reply is
 * still unread (and we haven't told them yet), it fires `conversation.unread_reply` so the host
 * app can send a push, and emails anonymous visitors who left an address.
 */
export async function notifyUnreadReplies(env: Env, contactId: string): Promise<void> {
  const contact = await env.DB.prepare("SELECT * FROM contacts WHERE id = ?").bind(contactId).first<ContactRow>();
  if (!contact) return;
  const { results } = await env.DB.prepare(
    `SELECT * FROM conversations
     WHERE contact_id = ? AND last_agent_message_at IS NOT NULL
       AND last_agent_message_at > COALESCE(contact_last_read_at, 0)
       AND last_agent_message_at > COALESCE(contact_notified_at, 0)`,
  )
    .bind(contactId)
    .all<ConversationRow>();
  if (results.length === 0) return;

  const now = Date.now();
  await env.DB.batch(
    results.map((row) =>
      env.DB.prepare("UPDATE conversations SET contact_notified_at = ? WHERE id = ?").bind(now, row.id),
    ),
  );

  for (const row of results) {
    const preview = row.last_message_author === "agent" ? row.last_message_body : null;
    await sendWebhook(env, "conversation.unread_reply", {
      conversationId: row.id,
      contact: { id: contact.id, externalId: contact.external_id, email: contact.email, name: contact.name },
      agentName: row.last_message_author_name,
      preview,
    });
    // Identified users hear about it from the host app (push) via the webhook above.
    if (!contact.is_identified && contact.email && contact.email_verified_at) await emailVisitor(env, contact.email);
  }
}

async function emailVisitor(env: Env, email: string) {
  const settings = await getSettings(env);
  // No message text or visitor-supplied names: the email only says there is a reply.
  await sendEmail(
    env,
    email,
    `New reply from ${settings.teamName}`,
    [`${settings.teamName} replied to your message.`, "", "Open the chat on our website to read it and answer."].join("\n"),
  );
}

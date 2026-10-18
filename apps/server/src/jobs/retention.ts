import { DELIVERY_RETENTION_MS } from "../lib/webhooks";
import type { Env } from "../env";
import { getSettings } from "../lib/settings";
import { deleteObjects } from "../lib/uploads";

const DAY_MS = 24 * 3600 * 1000;

/**
 * Daily clean-up (storage limitation, GDPR art. 5(1)(e)):
 * - uploads never sent with a message, after a day
 * - resolved conversations untouched for `retentionDays`, with their files
 * - anonymous visitors who never wrote, after 30 days
 * - expired agent sessions and invites
 * - audit log entries older than `auditRetentionDays` (at least 30)
 */
export async function runRetention(env: Env): Promise<Record<string, number>> {
  const now = Date.now();
  const settings = await getSettings(env);

  let pendingCount = 0;
  for (let round = 0; round < 50; round++) {
    const pending = await env.DB.prepare(
      "SELECT id, r2_key FROM attachments WHERE message_id IS NULL AND created_at < ? LIMIT 1000",
    )
      .bind(now - DAY_MS)
      .all<{ id: string; r2_key: string }>();
    if (pending.results.length === 0) break;
    pendingCount += pending.results.length;
    await deleteObjects(env, pending.results.map((r) => r.r2_key));
    for (let i = 0; i < pending.results.length; i += 90) {
      const ids = pending.results.slice(i, i + 90).map((r) => r.id);
      await env.DB.prepare(`DELETE FROM attachments WHERE id IN (${ids.map(() => "?").join(",")})`)
        .bind(...ids)
        .run();
    }
  }

  const cutoff = now - settings.retentionDays * DAY_MS;
  const expired = await env.DB.prepare(
    "SELECT id FROM conversations WHERE status = 'resolved' AND last_message_at < ? LIMIT 500",
  )
    .bind(cutoff)
    .all<{ id: string }>();
  for (const { id } of expired.results) {
    const files = await env.DB.prepare("SELECT r2_key FROM attachments WHERE conversation_id = ?")
      .bind(id)
      .all<{ r2_key: string }>();
    await deleteObjects(env, files.results.map((f) => f.r2_key));
    await env.DB.batch([
      env.DB.prepare("DELETE FROM attachments WHERE conversation_id = ?").bind(id),
      env.DB.prepare("DELETE FROM messages WHERE conversation_id = ?").bind(id),
      env.DB.prepare("DELETE FROM conversations WHERE id = ?").bind(id),
    ]);
  }

  const visitors = await env.DB.prepare(
    `DELETE FROM contacts WHERE is_identified = 0 AND COALESCE(last_seen_at, created_at) < ?
       AND NOT EXISTS (SELECT 1 FROM conversations WHERE contact_id = contacts.id)`,
  )
    .bind(now - 30 * DAY_MS)
    .run();

  if (expired.results.length > 0) await env.DB.prepare("INSERT INTO messages_fts(messages_fts) VALUES('optimize')").run();

  const deliveries = await env.DB.prepare("DELETE FROM webhook_deliveries WHERE created_at < ? AND status != 'pending'")
    .bind(now - DELIVERY_RETENTION_MS)
    .run();

  const auditEntries = await env.DB.prepare("DELETE FROM audit_log WHERE created_at < ?")
    .bind(now - Math.max(30, settings.auditRetentionDays) * DAY_MS)
    .run();

  await env.DB.batch([
    env.DB.prepare("DELETE FROM agent_sessions WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM agent_invites WHERE expires_at < ? AND accepted_at IS NULL").bind(now),
  ]);

  return {
    pendingUploads: pendingCount,
    conversations: expired.results.length,
    visitors: visitors.meta.changes ?? 0,
    webhookDeliveries: deliveries.meta.changes ?? 0,
    auditEntries: auditEntries.meta.changes ?? 0,
  };
}

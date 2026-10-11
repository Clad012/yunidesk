import type { AssistantUsage } from "yunidesk";
import type { Env } from "../../env";

export function utcDay(at = Date.now()): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** Cost always counts toward the budget; `reply: false` (dashboard tests) leaves the reply count alone. */
export async function recordUsage(env: Env, costUsd: number, options: { reply?: boolean } = {}): Promise<void> {
  const replies = options.reply === false ? 0 : 1;
  await env.DB.prepare(
    `INSERT INTO assistant_usage (day, replies, cost_usd) VALUES (?, ?, ?)
     ON CONFLICT(day) DO UPDATE SET replies = replies + excluded.replies, cost_usd = cost_usd + excluded.cost_usd`,
  )
    .bind(utcDay(), replies, Math.max(0, costUsd))
    .run();
}

export async function spentToday(env: Env): Promise<number> {
  const row = await env.DB.prepare("SELECT cost_usd FROM assistant_usage WHERE day = ?").bind(utcDay()).first<{ cost_usd: number }>();
  return row?.cost_usd ?? 0;
}

export async function usageToday(env: Env, budgetUsd: number): Promise<AssistantUsage> {
  const day = utcDay();
  const row = await env.DB.prepare("SELECT replies, cost_usd FROM assistant_usage WHERE day = ?")
    .bind(day)
    .first<{ replies: number; cost_usd: number }>();
  return { day, replies: row?.replies ?? 0, costUsd: Math.round((row?.cost_usd ?? 0) * 1_000_000) / 1_000_000, budgetUsd };
}

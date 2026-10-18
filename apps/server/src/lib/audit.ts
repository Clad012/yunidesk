import type { AuditAction, AuditEntry } from "yunidesk";
import { clientIp, type AppContext } from "../app-env";
import { newId } from "./ids";

export interface AuditTarget {
  type: string;
  id: string | null;
}

export interface AuditActor {
  type: AuditEntry["actor"]["type"];
  id: string | null;
  name: string | null;
}

export interface AuditRow {
  id: string;
  actor_type: AuditActor["type"];
  actor_id: string | null;
  actor_name: string | null;
  action: AuditAction;
  target_type: string | null;
  target_id: string | null;
  details: string;
  ip: string | null;
  user_agent: string | null;
  created_at: number;
}

const MAX_DETAILS = 4000;

/** The signed-in teammate, the API key (named after its bot), or the system. */
function currentActor(c: AppContext): AuditActor {
  const agent = c.get("agent") as AppContext["var"]["agent"] | undefined;
  const key = c.get("apiKey") as AppContext["var"]["apiKey"] | undefined;
  if (key && agent) return { type: "api_key", id: key.id, name: agent.name };
  if (agent) return { type: "agent", id: agent.id, name: agent.name };
  return { type: "system", id: null, name: null };
}

/**
 * Records one entry after the response (waitUntil). Never throws into the request: a failed audit
 * write is logged, the action itself still succeeds. Never pass secret values in `details`.
 */
export function audit(
  c: AppContext,
  action: AuditAction,
  target: AuditTarget | null,
  details: Record<string, unknown> = {},
  actor?: AuditActor,
): void {
  try {
    const who = actor ?? currentActor(c);
    let json = JSON.stringify(details);
    if (json.length > MAX_DETAILS) json = JSON.stringify({ truncated: true });
    const write = c.env.DB.prepare(
      `INSERT INTO audit_log (id, actor_type, actor_id, actor_name, action, target_type, target_id, details, ip, user_agent, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        newId("aud"),
        who.type,
        who.id,
        who.name?.slice(0, 254) ?? null,
        action,
        target?.type ?? null,
        target?.id ?? null,
        json,
        clientIp(c),
        (c.req.header("user-agent") ?? "").slice(0, 200) || null,
        Date.now(),
      )
      .run()
      .then(
        () => undefined,
        (error: unknown) => console.error("audit write failed", action, error),
      );
    c.executionCtx.waitUntil(write);
  } catch (error) {
    console.error("audit failed", action, error);
  }
}

/** Keys of `patch` whose value differs from `before`; what a settings entry records (never the values). */
export function changedKeys<T extends object>(before: T, patch: Partial<T>): string[] {
  return Object.keys(patch).filter((key) => {
    const next = patch[key as keyof T];
    return next !== undefined && JSON.stringify(next) !== JSON.stringify(before[key as keyof T]);
  });
}

export function toAuditEntry(row: AuditRow): AuditEntry {
  let details: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(row.details) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) details = parsed as Record<string, unknown>;
  } catch {
    // stays empty
  }
  return {
    id: row.id,
    actor: { type: row.actor_type, id: row.actor_id, name: row.actor_name },
    action: row.action,
    target: row.target_type ? { type: row.target_type, id: row.target_id } : null,
    details,
    ip: row.ip,
    userAgent: row.user_agent,
    createdAt: row.created_at,
  };
}

const CSV_COLUMNS = ["time", "actor_type", "actor_id", "actor", "action", "target_type", "target_id", "details", "ip", "user_agent"];

/**
 * One CSV field. Quoted when needed; values a spreadsheet would run as a formula (= + - @, tab,
 * carriage return) get a leading apostrophe, since actor names and emails are typed by anyone.
 */
export function csvField(value: string | number | null): string {
  if (value === null) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function auditCsv(rows: AuditRow[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const r of rows) {
    lines.push(
      [new Date(r.created_at).toISOString(), r.actor_type, r.actor_id, r.actor_name, r.action, r.target_type, r.target_id, r.details, r.ip, r.user_agent]
        .map(csvField)
        .join(","),
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

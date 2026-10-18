import { Hono } from "hono";
import { AUDIT_ACTIONS, AUDIT_CATEGORIES, type AuditEntry, type Page } from "yunidesk";
import type { AppContext, AppEnv } from "../../app-env";
import { auditCsv, toAuditEntry, type AuditRow } from "../../lib/audit";
import { badRequest } from "../../lib/errors";
import { requirePermission } from "../../lib/permissions";

const PAGE_SIZE = 50;
const EXPORT_LIMIT = 10_000;

/** Owners and admins read the audit log. Session only: API keys can't reach it. */
export const auditLogRoutes = new Hono<AppEnv>();

auditLogRoutes.use("*", async (c, next) => {
  requirePermission(c, "auditLog.read");
  return next();
});

/** `action` is one action (team.role_changed) or a whole group (team); `actor` an agent or API key id. */
function filters(c: AppContext): { where: string[]; values: unknown[] } {
  const where: string[] = [];
  const values: unknown[] = [];
  const action = c.req.query("action");
  if (action) {
    if ((AUDIT_ACTIONS as readonly string[]).includes(action)) {
      where.push("action = ?");
      values.push(action);
    } else if ((AUDIT_CATEGORIES as readonly string[]).includes(action)) {
      // Every action starting with "<group>." ("/" sorts right after ".").
      where.push("action >= ? AND action < ?");
      values.push(`${action}.`, `${action}/`);
    } else {
      throw badRequest("Unknown action");
    }
  }
  const actor = c.req.query("actor");
  if (actor) {
    if (actor.length > 64) throw badRequest("Unknown actor");
    where.push("actor_id = ?");
    values.push(actor);
  }
  return { where, values };
}

auditLogRoutes.get("/", async (c) => {
  const { where, values } = filters(c);
  const cursor = c.req.query("cursor");
  if (cursor) {
    const [at, id] = cursor.split("~");
    if (!at || !id || !/^\d+$/.test(at)) throw badRequest("Bad cursor");
    where.push("(created_at < ? OR (created_at = ? AND id < ?))");
    values.push(Number(at), Number(at), id);
  }
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM audit_log ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC, id DESC LIMIT ?`,
  )
    .bind(...values, PAGE_SIZE + 1)
    .all<AuditRow>();
  const page = results.slice(0, PAGE_SIZE);
  const last = page[page.length - 1];
  return c.json<Page<AuditEntry>>({
    items: page.map(toAuditEntry),
    nextCursor: results.length > PAGE_SIZE && last ? `${last.created_at}~${last.id}` : null,
  });
});

/** The newest 10,000 matching entries as CSV. */
auditLogRoutes.get("/export", async (c) => {
  const { where, values } = filters(c);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM audit_log ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC, id DESC LIMIT ?`,
  )
    .bind(...values, EXPORT_LIMIT)
    .all<AuditRow>();
  const day = new Date().toISOString().slice(0, 10);
  return new Response(auditCsv(results), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="audit-log-${day}.csv"`,
      "cache-control": "no-store",
    },
  });
});

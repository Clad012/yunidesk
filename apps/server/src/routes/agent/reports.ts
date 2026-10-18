import { Hono } from "hono";
import { z } from "zod";
import { CHANNELS, MAX_REPORT_DAYS } from "yunidesk";
import type { AppContext, AppEnv } from "../../app-env";
import { reportSummary, reportTags, reportTeammates, reportVolume, type ReportPeriod } from "../../db/reports";
import { requirePermission } from "../../lib/permissions";
import { badRequest } from "../../lib/errors";
import { toCsv } from "../../lib/reports/csv";
import { dayNumber, isIsoDay, isValidTimeZone } from "../../lib/reports/time";

const querySchema = z.object({
  from: z.string().refine(isIsoDay, "must be a date, YYYY-MM-DD"),
  to: z.string().refine(isIsoDay, "must be a date, YYYY-MM-DD"),
  tz: z.string().default("UTC").refine(isValidTimeZone, "must be an IANA time zone, like Europe/Paris"),
  channel: z.enum(CHANNELS as [string, ...string[]]).optional(),
  tagId: z.string().regex(/^tag_[0-9a-z]{26}$/, "must be a tag id").optional(),
  assigneeId: z.union([z.literal("none"), z.string().regex(/^agt_[0-9a-z]{1,40}$/, "must be a teammate id or none")]).optional(),
  format: z.enum(["json", "csv"]).default("json"),
});

/** Validated period and filters from the query string. */
export function parseReportQuery(raw: Record<string, string>): ReportPeriod & { format: "json" | "csv" } {
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw badRequest(issue ? `${issue.path.join(".") || "query"}: ${issue.message}` : "Invalid query", "invalid_query");
  }
  const q = parsed.data;
  const days = dayNumber(q.to) - dayNumber(q.from) + 1;
  if (days < 1) throw badRequest("to must be on or after from", "invalid_query");
  if (days > MAX_REPORT_DAYS) throw badRequest(`A report covers at most ${MAX_REPORT_DAYS} days`, "invalid_query");
  return {
    from: q.from,
    to: q.to,
    timeZone: q.tz,
    format: q.format,
    filter: {
      ...(q.channel ? { channel: q.channel as ReportPeriod["filter"]["channel"] } : {}),
      ...(q.tagId ? { tagId: q.tagId } : {}),
      ...(q.assigneeId ? { assigneeId: q.assigneeId === "none" ? null : q.assigneeId } : {}),
    },
  };
}

function csvResponse(c: AppContext, name: string, period: ReportPeriod, body: string): Response {
  return c.body(body, 200, {
    "content-type": "text/csv; charset=utf-8",
    "content-disposition": `attachment; filename="${name}-${period.from}-to-${period.to}.csv"`,
    "cache-control": "no-store",
  });
}

const seconds = (ms: number | null) => (ms === null ? null : Math.round(ms / 1000));
const percent = (ratio: number | null) => (ratio === null ? null : Math.round(ratio * 1000) / 10);

/** Reports. Teammates with reports.view (owners, admins), or API keys with reports:read. */
export const reportRoutes = new Hono<AppEnv>();

reportRoutes.use("*", async (c, next) => {
  // Owners and admins; API keys were already checked for reports:read.
  requirePermission(c, "reports.view");
  c.header("cache-control", "no-store");
  await next();
});

reportRoutes.get("/summary", async (c) => c.json(await reportSummary(c.env.DB, parseReportQuery(c.req.query()))));

reportRoutes.get("/volume", async (c) => c.json(await reportVolume(c.env.DB, parseReportQuery(c.req.query()))));

reportRoutes.get("/teammates", async (c) => {
  const period = parseReportQuery(c.req.query());
  const items = await reportTeammates(c.env.DB, period);
  if (period.format === "json") return c.json({ items });
  return csvResponse(
    c,
    "teammates",
    period,
    toCsv(
      ["teammate", "assigned", "replied", "resolved", "median_first_response_seconds", "ratings", "csat_percent"],
      items.map((row) => [row.agent.name, row.assigned, row.replied, row.resolved, seconds(row.firstResponseMedian), row.rated, percent(row.csat)]),
    ),
  );
});

reportRoutes.get("/tags", async (c) => {
  const period = parseReportQuery(c.req.query());
  const items = await reportTags(c.env.DB, period);
  if (period.format === "json") return c.json({ items });
  return csvResponse(
    c,
    "tags",
    period,
    toCsv(
      ["tag", "conversations", "resolved", "median_resolution_seconds"],
      items.map((row) => [row.tag.name, row.conversations, row.resolved, seconds(row.resolutionMedian)]),
    ),
  );
});

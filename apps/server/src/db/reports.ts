import type {
  Channel,
  DurationStats,
  ReportPeriodSummary,
  ReportSummary,
  ReportTagRow,
  ReportTeammateRow,
  ReportVolume,
} from "yunidesk";
import {
  durationStatsByGroup,
  EMPTY_DURATION,
  PERCENTILE_RANKS_SQL,
  type RankedRow,
} from "../lib/reports/percentiles";
import { assistantStats, satisfactionStats, type AssistantGroup } from "../lib/reports/outcomes";
import { datesBetween, HOUR_MS, localHour, offsetSegments, periodBounds, previousPeriod } from "../lib/reports/time";
import type { AgentRow, TagRow } from "./rows";
import { toPublicAgent } from "./serialize";
import { toTag } from "./tags";

/**
 * Report queries. They read only `conversations` (plus `conversation_tags`, and the team's own
 * replies through a partial index), always through a range index on created_at, resolved_at or
 * rating_at, so they stay fast with ~100k conversations. Percentiles are computed by SQLite with
 * ROW_NUMBER() and only the rows next to the median and the p90 come back (see percentiles.ts).
 */

export interface ReportFilter {
  channel?: Channel;
  tagId?: string;
  /** A teammate id; null for unassigned conversations. */
  assigneeId?: string | null;
}

export interface ReportPeriod {
  timeZone: string;
  /** Calendar days, both included. */
  from: string;
  to: string;
  filter: ReportFilter;
}

interface Range {
  start: number;
  end: number;
}

/** ` AND …` conditions on `c` (conversations) for the filters, with their values. */
export function filterSql(filter: ReportFilter): { sql: string; values: unknown[] } {
  const parts: string[] = [];
  const values: unknown[] = [];
  if (filter.channel) parts.push("c.channel = ?"), values.push(filter.channel);
  if (filter.tagId) parts.push("c.id IN (SELECT conversation_id FROM conversation_tags WHERE tag_id = ?)"), values.push(filter.tagId);
  if (filter.assigneeId === null) parts.push("c.assignee_id IS NULL");
  else if (filter.assigneeId) parts.push("c.assignee_id = ?"), values.push(filter.assigneeId);
  // Teams add one line here: `if (filter.teamId) parts.push("c.team_id = ?"), values.push(filter.teamId);`
  return { sql: parts.map((part) => ` AND ${part}`).join(""), values };
}

type TimeColumn = "created_at" | "resolved_at" | "rating_at";

/** `FROM conversations c … WHERE c.<column> in range AND filters`. Column, joins and extra conditions are code constants. */
function scoped(
  column: TimeColumn,
  range: Range,
  filter: ReportFilter,
  extra: { join?: string; where?: string } = {},
): { sql: string; values: unknown[] } {
  const f = filterSql(filter);
  return {
    sql: `FROM conversations c ${extra.join ?? ""} WHERE c.${column} >= ? AND c.${column} < ?${extra.where ? ` AND ${extra.where}` : ""}${f.sql}`,
    values: [range.start, range.end, ...f.values],
  };
}

/** Median and p90 of `value` per `group` (a constant when ungrouped). */
function percentileStatement(
  db: D1Database,
  value: string,
  group: string,
  column: TimeColumn,
  range: Range,
  filter: ReportFilter,
  extra: { join?: string; where?: string } = {},
): D1PreparedStatement {
  const from = scoped(column, range, filter, { ...extra, where: [`(${value}) IS NOT NULL`, extra.where].filter(Boolean).join(" AND ") });
  return db
    .prepare(
      `WITH d AS (SELECT ${group} AS g, ${value} AS v ${from.sql}),
       r AS (SELECT g, v, ROW_NUMBER() OVER (PARTITION BY g ORDER BY v) AS rn, COUNT(*) OVER (PARTITION BY g) AS n FROM d)
       SELECT g, v, rn, n FROM r WHERE ${PERCENTILE_RANKS_SQL}`,
    )
    .bind(...from.values);
}

const FIRST_RESPONSE = "c.first_human_reply_at - c.first_contact_message_at";
const RESOLUTION = "c.resolved_at - c.created_at";

function bounds(period: Pick<ReportPeriod, "timeZone" | "from" | "to">): Range {
  return periodBounds(period.timeZone, period.from, period.to);
}

function periodStatements(db: D1Database, range: Range, filter: ReportFilter): D1PreparedStatement[] {
  const created = scoped("created_at", range, filter);
  const rated = scoped("rating_at", range, filter);
  const assistant = scoped("created_at", range, filter, { where: "c.ai_involved = 1" });
  return [
    db.prepare(`SELECT COUNT(*) AS created, COALESCE(SUM(c.reopened_count > 0), 0) AS reopened ${created.sql}`).bind(...created.values),
    percentileStatement(db, FIRST_RESPONSE, "0", "created_at", range, filter),
    percentileStatement(db, RESOLUTION, "0", "resolved_at", range, filter),
    db.prepare(`SELECT c.rating_score AS score, COUNT(*) AS n ${rated.sql} GROUP BY c.rating_score`).bind(...rated.values),
    db
      .prepare(
        `SELECT (c.status = 'resolved') AS resolved, c.human_replied AS human_replied, c.ai_state AS ai_state, COUNT(*) AS n
         ${assistant.sql} GROUP BY 1, 2, 3`,
      )
      .bind(...assistant.values),
  ];
}

function readPeriod(from: string, to: string, results: D1Result[]): ReportPeriodSummary {
  const [counts, firstResponse, resolution, ratings, assistant] = results as [
    D1Result<{ created: number; reopened: number }>,
    D1Result<RankedRow>,
    D1Result<RankedRow>,
    D1Result<{ score: number; n: number }>,
    D1Result<AssistantGroup>,
  ];
  const one = (rows: RankedRow[]): DurationStats => durationStatsByGroup(rows).get("0") ?? EMPTY_DURATION;
  const resolutionStats = one(resolution.results);
  return {
    from,
    to,
    created: counts.results[0]?.created ?? 0,
    resolved: resolutionStats.count,
    reopened: counts.results[0]?.reopened ?? 0,
    firstResponse: one(firstResponse.results),
    resolution: resolutionStats,
    satisfaction: satisfactionStats(ratings.results),
    assistant: assistantStats(assistant.results),
  };
}

export async function reportSummary(db: D1Database, period: ReportPeriod): Promise<ReportSummary> {
  const previous = previousPeriod(period.from, period.to);
  const f = filterSql(period.filter);
  const statements = [
    ...periodStatements(db, bounds(period), period.filter),
    ...periodStatements(db, bounds({ ...period, ...previous }), period.filter),
    db
      .prepare(
        `SELECT COALESCE(SUM(c.status = 'open'), 0) AS open, COALESCE(SUM(c.status = 'snoozed'), 0) AS snoozed
         FROM conversations c WHERE c.status IN ('open', 'snoozed')${f.sql}`,
      )
      .bind(...f.values),
  ];
  const results = await db.batch(statements);
  const snapshot = (results[10] as D1Result<{ open: number; snoozed: number }>).results[0];
  return {
    timeZone: period.timeZone,
    current: readPeriod(period.from, period.to, results.slice(0, 5)),
    previous: readPeriod(previous.from, previous.to, results.slice(5, 10)),
    snapshot: { open: snapshot?.open ?? 0, snoozed: snapshot?.snoozed ?? 0 },
  };
}

/** Counts per local hour number, one statement per DST segment of the period. */
function hourlyStatements(db: D1Database, column: "created_at" | "resolved_at", period: ReportPeriod): D1PreparedStatement[] {
  const { start, end } = bounds(period);
  return offsetSegments(period.timeZone, start, end).map((segment) => {
    const from = scoped(column, segment, period.filter);
    // Bound numbers may arrive as REAL: cast, so the division stays an integer division.
    return db
      .prepare(`SELECT (c.${column} + CAST(? AS INTEGER)) / ${HOUR_MS} AS h, COUNT(*) AS n ${from.sql} GROUP BY h`)
      .bind(segment.offset, ...from.values);
  });
}

export async function reportVolume(db: D1Database, period: ReportPeriod): Promise<ReportVolume> {
  const created = hourlyStatements(db, "created_at", period);
  const resolved = hourlyStatements(db, "resolved_at", period);
  const results = (await db.batch([...created, ...resolved])) as D1Result<{ h: number; n: number }>[];
  const days = new Map(datesBetween(period.from, period.to).map((date) => [date, { date, created: 0, resolved: 0 }]));
  const busiestHours = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  results.forEach((result, index) => {
    const isCreated = index < created.length;
    for (const row of result.results) {
      const local = localHour(row.h);
      const day = days.get(local.date);
      if (day) day[isCreated ? "created" : "resolved"] += row.n;
      if (isCreated) busiestHours[local.weekday]![local.hour]! += row.n;
    }
  });
  return { timeZone: period.timeZone, days: [...days.values()], busiestHours };
}

function countsByGroup(result: D1Result<{ g: string | null; n: number }>): Map<string, number> {
  return new Map(result.results.map((row) => [String(row.g ?? ""), row.n]));
}

export async function reportTeammates(db: D1Database, period: ReportPeriod): Promise<ReportTeammateRow[]> {
  const range = bounds(period);
  const f = filterSql(period.filter);
  const assigned = scoped("created_at", range, period.filter, { where: "c.assignee_id IS NOT NULL" });
  const resolved = scoped("resolved_at", range, period.filter, { where: "c.assignee_id IS NOT NULL" });
  const rated = scoped("rating_at", range, period.filter, { where: "c.assignee_id IS NOT NULL" });
  const results = await db.batch([
    db.prepare("SELECT * FROM agents WHERE kind = 'human' ORDER BY name").bind(),
    db.prepare(`SELECT c.assignee_id AS g, COUNT(*) AS n ${assigned.sql} GROUP BY c.assignee_id`).bind(...assigned.values),
    db.prepare(`SELECT c.assignee_id AS g, COUNT(*) AS n ${resolved.sql} GROUP BY c.assignee_id`).bind(...resolved.values),
    // The partial index messages_team_replies covers exactly these replies.
    db
      .prepare(
        `SELECT m.agent_id AS g, COUNT(DISTINCT m.conversation_id) AS n
         FROM messages m JOIN conversations c ON c.id = m.conversation_id JOIN agents a ON a.id = m.agent_id
         WHERE m.author_type = 'agent' AND m.kind = 'text' AND m.ai = 0 AND m.created_at >= ? AND m.created_at < ?
           AND a.kind = 'human'${f.sql}
         GROUP BY m.agent_id`,
      )
      .bind(range.start, range.end, ...f.values),
    percentileStatement(db, FIRST_RESPONSE, "c.assignee_id", "created_at", range, period.filter, { where: "c.assignee_id IS NOT NULL" }),
    db
      .prepare(`SELECT c.assignee_id AS g, c.rating_score AS score, COUNT(*) AS n ${rated.sql} GROUP BY 1, 2`)
      .bind(...rated.values),
  ]);
  const agents = (results[0] as D1Result<AgentRow>).results;
  const assignedBy = countsByGroup(results[1] as D1Result<{ g: string; n: number }>);
  const resolvedBy = countsByGroup(results[2] as D1Result<{ g: string; n: number }>);
  const repliedBy = countsByGroup(results[3] as D1Result<{ g: string; n: number }>);
  const firstResponseBy = durationStatsByGroup((results[4] as D1Result<RankedRow>).results);
  const ratingRows = (results[5] as D1Result<{ g: string; score: number; n: number }>).results;

  const rows: ReportTeammateRow[] = [];
  for (const agent of agents) {
    if (period.filter.assigneeId && agent.id !== period.filter.assigneeId) continue;
    const satisfaction = satisfactionStats(ratingRows.filter((row) => row.g === agent.id));
    const row: ReportTeammateRow = {
      agent: toPublicAgent(agent),
      assigned: assignedBy.get(agent.id) ?? 0,
      replied: repliedBy.get(agent.id) ?? 0,
      resolved: resolvedBy.get(agent.id) ?? 0,
      firstResponseMedian: firstResponseBy.get(agent.id)?.median ?? null,
      rated: satisfaction.rated,
      csat: satisfaction.csat,
    };
    // Teammates who left still show while they have numbers in the period.
    const active = agent.disabled_at === null;
    if (active || row.assigned || row.replied || row.resolved || row.rated) rows.push(row);
  }
  return rows;
}

export async function reportTags(db: D1Database, period: ReportPeriod): Promise<ReportTagRow[]> {
  const range = bounds(period);
  const join = "JOIN conversation_tags ct ON ct.conversation_id = c.id";
  const created = scoped("created_at", range, period.filter, { join });
  const results = await db.batch([
    db.prepare("SELECT * FROM tags ORDER BY name").bind(),
    db.prepare(`SELECT ct.tag_id AS g, COUNT(*) AS n ${created.sql} GROUP BY ct.tag_id`).bind(...created.values),
    percentileStatement(db, RESOLUTION, "ct.tag_id", "resolved_at", range, period.filter, { join }),
  ]);
  const tags = (results[0] as D1Result<TagRow>).results;
  const createdBy = countsByGroup(results[1] as D1Result<{ g: string; n: number }>);
  const resolutionBy = durationStatsByGroup((results[2] as D1Result<RankedRow>).results);
  return tags
    .map((tag) => {
      const resolution = resolutionBy.get(tag.id) ?? EMPTY_DURATION;
      return { tag: toTag(tag), conversations: createdBy.get(tag.id) ?? 0, resolved: resolution.count, resolutionMedian: resolution.median };
    })
    .sort((a, b) => b.conversations - a.conversations || b.resolved - a.resolved || a.tag.name.localeCompare(b.tag.name));
}

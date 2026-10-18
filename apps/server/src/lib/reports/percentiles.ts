import type { DurationStats } from "yunidesk";

/**
 * Percentiles by linear interpolation between closest ranks (the "type 7" definition used by
 * spreadsheets' PERCENTILE.INC and numpy): for n sorted values, the p-th percentile sits at
 * 0-based position (n - 1) × p / 100.
 *
 * D1 has no percentile function, so the SQL numbers each group's values with ROW_NUMBER() and
 * returns only the (at most 4) rows these ranks name — the database sorts, nothing large travels.
 * `PERCENTILE_RANKS_SQL` and `percentileRanks` must agree: both use integer division.
 */
export const REPORT_PERCENTILES = [50, 90] as const;
export type ReportPercentile = (typeof REPORT_PERCENTILES)[number];

/** 1-based ranks (ROW_NUMBER) of the two values the p-th percentile of n values lies between. */
export function percentileRanks(n: number, p: number): [number, number] {
  const below = Math.floor(((n - 1) * p) / 100);
  return [below + 1, Math.min(below + 2, n)];
}

/** `rn IN (…)` for `REPORT_PERCENTILES`, with `n` the group size. Constants only: no input reaches it. */
export const PERCENTILE_RANKS_SQL = `rn IN (${REPORT_PERCENTILES.flatMap((p) => [
  `((n - 1) * ${p}) / 100 + 1`,
  `((n - 1) * ${p}) / 100 + 2`,
]).join(", ")})`;

/** The p-th percentile of n values, given the values at the ranks `percentileRanks` names. */
export function percentileFromRanks(n: number, p: number, valueAtRank: (rank: number) => number | undefined): number | null {
  if (n <= 0) return null;
  const [lowRank, highRank] = percentileRanks(n, p);
  const low = valueAtRank(lowRank);
  const high = valueAtRank(highRank);
  if (low === undefined || high === undefined) return null;
  const fraction = (((n - 1) * p) % 100) / 100;
  return low + (high - low) * fraction;
}

/** Reference implementation over a full list (any order). */
export function percentile(values: readonly number[], p: number): number | null {
  const sorted = [...values].sort((a, b) => a - b);
  return percentileFromRanks(sorted.length, p, (rank) => sorted[rank - 1]);
}

export interface RankedRow {
  g: string | number | null;
  v: number;
  rn: number;
  n: number;
}

/** Groups the rows of a percentile query into median/p90 per group key. */
export function durationStatsByGroup(rows: readonly RankedRow[]): Map<string, DurationStats> {
  const groups = new Map<string, { n: number; values: Map<number, number> }>();
  for (const row of rows) {
    const key = String(row.g ?? "");
    const group = groups.get(key) ?? { n: row.n, values: new Map<number, number>() };
    group.values.set(row.rn, row.v);
    groups.set(key, group);
  }
  const out = new Map<string, DurationStats>();
  for (const [key, { n, values }] of groups) {
    const at = (rank: number) => values.get(rank);
    const round = (value: number | null) => (value === null ? null : Math.round(value));
    out.set(key, { count: n, median: round(percentileFromRanks(n, 50, at)), p90: round(percentileFromRanks(n, 90, at)) });
  }
  return out;
}

export const EMPTY_DURATION: DurationStats = { count: 0, median: null, p90: null };

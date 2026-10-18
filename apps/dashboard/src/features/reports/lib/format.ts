const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/** "45 s", "4 min", "2 h 10 min", "3 d 4 h", "12 d"; an em dash without a value. */
export function formatDuration(ms: number | null): string {
  if (ms === null || !Number.isFinite(ms)) return "—";
  // Round first, then pick the unit, so 59 min 40 s reads "1 h", never "60 min".
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.round(ms / MINUTE);
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 24 * 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const hours = Math.round(ms / HOUR);
  const d = Math.floor(hours / 24);
  const h = hours % 24;
  return h && d < 7 ? `${d} d ${h} h` : `${d} d`;
}

const integer = new Intl.NumberFormat("en");
const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });

export function formatCount(n: number): string {
  return n >= 10_000 ? compact.format(n) : integer.format(n);
}

/** 0–1 → "67%"; an em dash without a value. */
export function formatPercent(ratio: number | null): string {
  return ratio === null ? "—" : `${Math.round(ratio * 100)}%`;
}

export type MetricKind = "count" | "duration" | "rate";

export interface Comparison {
  /** "+12%", "−3%", "+5 pts", "0%". */
  text: string;
  direction: "up" | "down" | "flat";
}

/**
 * Change against the previous period: counts and durations as a relative change, rates (0–1) in
 * percentage points. Null when there is nothing to compare with.
 */
export function compareMetric(current: number | null, previous: number | null, kind: MetricKind): Comparison | null {
  if (current === null || previous === null) return null;
  if (kind === "rate") {
    const points = Math.round((current - previous) * 100);
    return { text: `${points > 0 ? "+" : points < 0 ? "−" : ""}${Math.abs(points)} pts`, direction: points > 0 ? "up" : points < 0 ? "down" : "flat" };
  }
  if (previous === 0) return current === 0 ? { text: "0%", direction: "flat" } : null;
  const change = Math.round(((current - previous) / previous) * 100);
  return { text: `${change > 0 ? "+" : change < 0 ? "−" : ""}${Math.abs(change)}%`, direction: change > 0 ? "up" : change < 0 ? "down" : "flat" };
}

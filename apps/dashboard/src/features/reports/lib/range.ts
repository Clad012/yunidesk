import { MAX_REPORT_DAYS } from "yunidesk";

export const RANGE_PRESETS = ["today", "7d", "30d", "90d"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number] | "custom";

const DAY_MS = 86_400_000;

/** The viewer's IANA time zone; reports count days in it. */
export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Today's calendar date (YYYY-MM-DD) in `timeZone`. */
export function todayIn(timeZone: string, now: number = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Number of calendar days from `from` to `to`, both included. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS) + 1;
}

/** "Last 7 days" ends today and includes it. */
export function presetRange(preset: Exclude<RangePreset, "custom">, today: string): { from: string; to: string } {
  const length = preset === "today" ? 1 : Number(preset.slice(0, -1));
  return { from: addDays(today, -(length - 1)), to: today };
}

/** A custom range the server accepts: real dates, in order, not too long. */
export function isValidRange(from: string, to: string): boolean {
  const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && addDays(d, 0) === d;
  if (!ok(from) || !ok(to)) return false;
  const days = daysBetween(from, to);
  return days >= 1 && days <= MAX_REPORT_DAYS;
}

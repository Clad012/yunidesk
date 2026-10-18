/**
 * Calendar maths in the viewer's time zone. Offsets change with daylight saving time, so a report
 * period is cut into segments with one constant offset each; SQL buckets each segment with
 * `(t + offset) / HOUR_MS`, which gives local hour numbers, and these helpers turn local hour numbers
 * into dates, weekdays and hours.
 */

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** An IANA zone the runtime knows ("Europe/Paris", "UTC"). */
export function isValidTimeZone(value: string): boolean {
  if (!value || value.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(value)) return false;
  try {
    formatter(value);
    return true;
  } catch {
    return false;
  }
}

/** Milliseconds to add to a UTC instant to get the wall-clock time in `timeZone` at that instant. */
export function offsetAt(timeZone: string, at: number): number {
  const parts: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(at)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  const wall = Date.UTC(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
  return wall - (at - (((at % 1000) + 1000) % 1000));
}

/** "2026-10-25" → days since 1970-01-01. */
export function dayNumber(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.floor(Date.UTC(y!, m! - 1, d!) / DAY_MS);
}

/** Days since 1970-01-01 → "2026-10-25". */
export function dateOfDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** A real calendar day, YYYY-MM-DD. */
export function isIsoDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return dateOfDay(dayNumber(value)) === value;
}

/** The UTC instant of local midnight starting `date` in `timeZone`. */
export function localMidnight(timeZone: string, date: string): number {
  const wall = dayNumber(date) * DAY_MS;
  // Two passes: the offset at the guess can differ from the offset at the answer near a change.
  const guess = wall - offsetAt(timeZone, wall);
  return wall - offsetAt(timeZone, guess);
}

/** [start, end) instants of the calendar days `from` … `to` (both included) in `timeZone`. */
export function periodBounds(timeZone: string, from: string, to: string): { start: number; end: number } {
  return { start: localMidnight(timeZone, from), end: localMidnight(timeZone, dateOfDay(dayNumber(to) + 1)) };
}

/** The same number of days, just before. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const length = dayNumber(to) - dayNumber(from) + 1;
  return { from: dateOfDay(dayNumber(from) - length), to: dateOfDay(dayNumber(from) - 1) };
}

export interface OffsetSegment {
  start: number;
  end: number;
  offset: number;
}

/** Cuts [start, end) where the zone's offset changes (DST); each piece has one offset. */
export function offsetSegments(timeZone: string, start: number, end: number): OffsetSegment[] {
  const segments: OffsetSegment[] = [];
  let segmentStart = start;
  let offset = offsetAt(timeZone, start);
  // Offsets change at most a few times a year, never twice within 12 hours.
  const STEP = 12 * HOUR_MS;
  for (let probe = start; probe < end; ) {
    const next = Math.min(probe + STEP, end - 1);
    const nextOffset = offsetAt(timeZone, next);
    if (nextOffset !== offset) {
      // Binary search the first millisecond with the new offset.
      let lo = probe;
      let hi = next;
      while (hi - lo > 1) {
        const mid = lo + Math.floor((hi - lo) / 2);
        if (offsetAt(timeZone, mid) === offset) lo = mid;
        else hi = mid;
      }
      segments.push({ start: segmentStart, end: hi, offset });
      segmentStart = hi;
      offset = nextOffset;
    }
    if (next <= probe) break;
    probe = next;
  }
  segments.push({ start: segmentStart, end, offset });
  return segments;
}

/** A local hour number ((t + offset) / HOUR_MS, floored) → its local date, weekday (0 = Monday) and hour. */
export function localHour(hourNumber: number): { date: string; weekday: number; hour: number } {
  const day = Math.floor(hourNumber / 24);
  // 1970-01-01 was a Thursday (3 with Monday = 0).
  return { date: dateOfDay(day), weekday: (((day + 3) % 7) + 7) % 7, hour: ((hourNumber % 24) + 24) % 24 };
}

/** Every date from `from` to `to`, both included. */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let day = dayNumber(from); day <= dayNumber(to); day++) out.push(dateOfDay(day));
  return out;
}

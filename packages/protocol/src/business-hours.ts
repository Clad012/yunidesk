import { format, formatClock, pickLocalized, replyTimeLabel, type SupportStrings } from "./strings";
import type { Availability, BusinessHours, Locale, LocalizedText, ReplyTime, SystemEvent } from "./types";

// Business hours: when the team answers. Pure time maths shared by the server (which decides),
// the dashboard (which shows "Outside business hours") and the messengers (which only format
// `nextOpenAt` in the customer's own time zone, so they never need Intl time zone support).

export const MAX_RANGES_PER_DAY = 3;
export const MAX_HOLIDAYS = 100;

const DAY_MS = 86_400_000;
/** Far enough to get past 100 holidays in a row and a week with a single range. */
const SEARCH_DAYS = 400;
/** Wider than any UTC offset, to read the offsets on both sides of a wall-clock time. */
const OFFSET_PROBE_MS = 14 * 3_600_000;

export const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  enabled: false,
  timezone: "UTC",
  week: [1, 2, 3, 4, 5].map((day) => ({ day, ranges: [{ from: "09:00", to: "17:00" }] })),
  holidays: [],
};

const CLOCK = /^(?:([01]\d|2[0-3]):([0-5]\d)|24:00)$/;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** "09:30" → 570 minutes; "24:00" → 1440; anything else → null. */
export function parseClock(value: string): number | null {
  const match = CLOCK.exec(value);
  if (!match) return null;
  return match[1] === undefined ? 1440 : Number(match[1]) * 60 + Number(match[2]);
}

export function isValidTimeZone(timezone: string): boolean {
  if (!timezone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function isRealDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** What is wrong with these hours, in plain words, or null when they are fine. */
export function businessHoursProblem(hours: BusinessHours): string | null {
  if (!isValidTimeZone(hours.timezone)) return `Unknown time zone "${hours.timezone}"`;
  const seen = new Set<number>();
  for (const { day, ranges } of hours.week) {
    if (!Number.isInteger(day) || day < 0 || day > 6) return "Days go from 0 (Sunday) to 6 (Saturday)";
    if (seen.has(day)) return "Each day can appear only once";
    seen.add(day);
    if (ranges.length > MAX_RANGES_PER_DAY) return `Up to ${MAX_RANGES_PER_DAY} time ranges per day`;
    const parsed: [number, number][] = [];
    for (const range of ranges) {
      const from = parseClock(range.from);
      const to = parseClock(range.to);
      if (from === null || to === null) return "Use times like 09:00, between 00:00 and 24:00";
      if (from >= to) return `${range.from}–${range.to} must start before it ends (no range crosses midnight)`;
      parsed.push([from, to]);
    }
    parsed.sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < parsed.length; i++) {
      if (parsed[i]![0] < parsed[i - 1]![1]) return "Time ranges on the same day can't overlap";
    }
  }
  if (hours.holidays.length > MAX_HOLIDAYS) return `Up to ${MAX_HOLIDAYS} holidays`;
  if (new Set(hours.holidays).size !== hours.holidays.length) return "Each holiday can appear only once";
  for (const holiday of hours.holidays) if (!isRealDate(holiday)) return `"${holiday}" is not a date like 2026-12-25`;
  return null;
}

/** The same hours in a stable order: days, ranges and holidays sorted. */
export function normalizeBusinessHours(hours: BusinessHours): BusinessHours {
  return {
    enabled: hours.enabled,
    timezone: hours.timezone,
    week: [...hours.week]
      .filter((d) => d.ranges.length > 0)
      .sort((a, b) => a.day - b.day)
      .map((d) => ({ day: d.day, ranges: [...d.ranges].sort((a, b) => (parseClock(a.from) ?? 0) - (parseClock(b.from) ?? 0)) })),
    holidays: [...hours.holidays].sort(),
  };
}

// ---- Wall-clock time in a zone ----

interface Wall {
  /** The local date at UTC midnight, so days can be counted with plain arithmetic. */
  dayUtc: number;
  /** Seconds since local midnight. */
  seconds: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timezone: string): Intl.DateTimeFormat {
  let f = formatters.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timezone, f);
  }
  return f;
}

function wallAt(instant: number, timezone: string): Wall {
  const parts: Record<string, number> = {};
  for (const part of formatter(timezone).formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  const hour = (parts.hour ?? 0) % 24;
  return {
    dayUtc: Date.UTC(parts.year ?? 1970, (parts.month ?? 1) - 1, parts.day ?? 1),
    seconds: hour * 3600 + (parts.minute ?? 0) * 60 + (parts.second ?? 0),
  };
}

/** Local time minus UTC at this instant, in ms. */
function offsetAt(instant: number, timezone: string): number {
  const wall = wallAt(instant, timezone);
  return wall.dayUtc + wall.seconds * 1000 - (instant - (((instant % 1000) + 1000) % 1000));
}

/** The first whole second in (lo, hi] with the offset `hi` has; there must be a change in between. */
function transitionBetween(lo: number, hi: number, timezone: string): number {
  lo = Math.floor(lo / 1000) * 1000;
  hi = Math.ceil(hi / 1000) * 1000;
  const after = offsetAt(hi, timezone);
  while (hi - lo > 1000) {
    const mid = lo + Math.floor((hi - lo) / 2000) * 1000;
    if (offsetAt(mid, timezone) === after) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * The instants a wall-clock time (the local date and time, written as if it were UTC) happens at:
 * one usually, two in the hour repeated when clocks go back, none in the hour skipped when they go
 * forward (the clock change itself is a candidate of its own, see `transitionNear`).
 */
function instantsAtWall(wallUtc: number, timezone: string): number[] {
  const offsets = new Set([offsetAt(wallUtc - OFFSET_PROBE_MS, timezone), offsetAt(wallUtc + OFFSET_PROBE_MS, timezone)]);
  return [...offsets].map((o) => wallUtc - o).filter((t) => t + offsetAt(t, timezone) === wallUtc);
}

/**
 * A clock change around this local day, if any. Wall time jumps there, so the team may open right
 * then: forward past a range's start that never happens, or back into the middle of a range.
 */
function transitionNear(dayUtc: number, timezone: string): number | null {
  const lo = dayUtc - OFFSET_PROBE_MS;
  const hi = dayUtc + DAY_MS + OFFSET_PROBE_MS;
  return offsetAt(lo, timezone) === offsetAt(hi, timezone) ? null : transitionBetween(lo, hi, timezone);
}

function dateKey(dayUtc: number): string {
  return new Date(dayUtc).toISOString().slice(0, 10);
}

function rangesOn(hours: BusinessHours, dayUtc: number): [number, number][] {
  if (hours.holidays.includes(dateKey(dayUtc))) return [];
  const weekday = new Date(dayUtc).getUTCDay();
  const day = hours.week.find((d) => d.day === weekday);
  if (!day) return [];
  const ranges: [number, number][] = [];
  for (const range of day.ranges) {
    const from = parseClock(range.from);
    const to = parseClock(range.to);
    if (from !== null && to !== null && from < to) ranges.push([from, to]);
  }
  return ranges;
}

// ---- Open or closed ----

/** Whether the team is open at this instant. Hours turned off: always open. */
export function isOpenAt(hours: BusinessHours, instant: number): boolean {
  if (!hours.enabled) return true;
  const wall = wallAt(instant, hours.timezone);
  const minute = wall.seconds / 60;
  return rangesOn(hours, wall.dayUtc).some(([from, to]) => minute >= from && minute < to);
}

/**
 * The first instant at or after `instant` when the team is open: `instant` itself when open now,
 * null when it never opens (a week without hours). Honours the zone's clock changes.
 */
export function nextOpening(hours: BusinessHours, instant: number): number | null {
  if (isOpenAt(hours, instant)) return instant;
  if (!hours.week.some((d) => d.ranges.length > 0)) return null;
  const start = wallAt(instant, hours.timezone).dayUtc;
  let best: number | null = null;
  let foundOn = 0;
  for (let d = 0; d <= SEARCH_DAYS; d++) {
    if (best !== null && d > foundOn + 1) break;
    const dayUtc = start + d * DAY_MS;
    const candidates = rangesOn(hours, dayUtc).flatMap(([from]) => instantsAtWall(dayUtc + from * 60_000, hours.timezone));
    const jump = transitionNear(dayUtc, hours.timezone);
    if (jump !== null) candidates.push(jump);
    for (const at of candidates) {
      if (at > instant && (best === null || at < best) && isOpenAt(hours, at)) {
        best = at;
        foundOn = d;
      }
    }
  }
  return best;
}

export function availabilityAt(hours: BusinessHours, instant: number): Availability {
  return isOpenAt(hours, instant) ? { open: true, nextOpenAt: null } : { open: false, nextOpenAt: nextOpening(hours, instant) };
}

/**
 * Whether a messenger should say the team is away. `availability` was computed when the config was
 * fetched, so once its `nextOpenAt` has passed the team counts as back.
 */
export function isAwayNow(availability: Availability | null | undefined, now: number = Date.now()): boolean {
  if (!availability || availability.open) return false;
  return availability.nextOpenAt === null || now < availability.nextOpenAt;
}

// ---- Copy for the messengers (in the customer's locale and their device's time zone) ----

function localDayUtc(at: number): number {
  const d = new Date(at);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/** "today at 09:00", "tomorrow at 09:00", "Monday at 09:00", then "on 12 November at 09:00". */
export function formatBackAt(strings: SupportStrings, at: number, now: number = Date.now(), locale: Locale = "en"): string {
  const time = formatClock(at, locale);
  const days = Math.round((localDayUtc(at) - localDayUtc(now)) / DAY_MS);
  if (days <= 0) return format(strings.backToday, { time });
  if (days === 1) return format(strings.backTomorrow, { time });
  if (days < 7) return format(strings.backWeekday, { day: new Date(at).toLocaleDateString(locale, { weekday: "long" }), time });
  return format(strings.backDate, { date: new Date(at).toLocaleDateString(locale, { day: "numeric", month: "long" }), time });
}

/** The line under "Send us a message": when the team is back while away, the usual reply time otherwise. */
export function replyStatusLabel(
  strings: SupportStrings,
  config: { replyTime: ReplyTime; availability?: Availability },
  now: number = Date.now(),
  locale: Locale = "en",
): string {
  if (!isAwayNow(config.availability, now)) return replyTimeLabel(strings, config.replyTime);
  const back = config.availability?.nextOpenAt ?? null;
  return back === null ? strings.awayNoReturn : format(strings.awayBack, { when: formatBackAt(strings, back, now, locale) });
}

/** The automatic away message as the customer reads it: the team's text (or the default), then when it's back. */
export function awayEventText(
  strings: SupportStrings,
  event: { message: LocalizedText; backAt: number | null },
  now: number = Date.now(),
  locale: Locale = "en",
): { message: string; back: string | null } {
  return {
    message: pickLocalized(event.message, locale) ?? strings.awayMessageDefault,
    back: event.backAt === null ? null : format(strings.backAt, { when: formatBackAt(strings, event.backAt, now, locale) }),
  };
}

/** The hand-off marker: says when the team is back when it happened outside business hours. */
export function handedOffText(
  strings: SupportStrings,
  event: Extract<SystemEvent, { type: "handed_off" }>,
  now: number = Date.now(),
  locale: Locale = "en",
): string {
  return typeof event.backAt === "number"
    ? format(strings.handedOffAway, { when: formatBackAt(strings, event.backAt, now, locale) })
    : strings.handedOff;
}

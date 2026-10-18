import { MAX_HOLIDAYS, MAX_RANGES_PER_DAY, isValidTimeZone, parseClock, type BusinessHours, type TimeRange } from "yunidesk";

/** Monday first, the way people read a week. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const WEEKDAYS = [1, 2, 3, 4, 5];

export function rangesOf(hours: BusinessHours, day: number): TimeRange[] {
  return hours.week.find((d) => d.day === day)?.ranges ?? [];
}

export function withRanges(hours: BusinessHours, day: number, ranges: TimeRange[]): BusinessHours {
  const week = hours.week.filter((d) => d.day !== day);
  if (ranges.length > 0) week.push({ day, ranges });
  return { ...hours, week: week.sort((a, b) => a.day - b.day) };
}

function clock(minutes: number): string {
  if (minutes >= 1440) return "24:00";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/** Hours to add to a day: 09:00–17:00 on an empty day, else the hour after its last range. Null when it's full. */
export function suggestRange(ranges: TimeRange[]): TimeRange | null {
  if (ranges.length >= MAX_RANGES_PER_DAY) return null;
  if (ranges.length === 0) return { from: "09:00", to: "17:00" };
  const end = Math.max(...ranges.map((r) => parseClock(r.to) ?? 0));
  if (end >= 1440) return null;
  return { from: clock(end), to: clock(Math.min(1440, end + 60)) };
}

/** Tuesday to Friday get Monday's hours (closed if Monday is closed). */
export function copyMondayToWeekdays(hours: BusinessHours): BusinessHours {
  const monday = rangesOf(hours, 1);
  return WEEKDAYS.reduce((next, day) => withRanges(next, day, monday.map((r) => ({ ...r }))), hours);
}

export type HolidayProblem = "taken" | "full" | null;

export function addHoliday(hours: BusinessHours, date: string): { hours: BusinessHours; problem: HolidayProblem } {
  if (hours.holidays.includes(date)) return { hours, problem: "taken" };
  if (hours.holidays.length >= MAX_HOLIDAYS) return { hours, problem: "full" };
  return { hours: { ...hours, holidays: [...hours.holidays, date].sort() }, problem: null };
}

/** The browser's own zone, or UTC when it can't say. */
export function browserTimeZone(): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return zone && isValidTimeZone(zone) ? zone : "UTC";
}

/** Every zone the browser knows, UTC included (some browsers leave it out). */
export function timeZones(): string[] {
  const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return zones.includes("UTC") ? zones : ["UTC", ...zones];
}

/** A closing time of midnight is "24:00"; a time input can only show it as 00:00. */
export const toInputTime = (value: string) => (value === "24:00" ? "00:00" : value);
export const fromInputTime = (value: string, end: boolean) => (end && value === "00:00" ? "24:00" : value);

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const clock = new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" });
const shortDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
const longDate = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" });
const fullDate = new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" });
const weekday = new Intl.DateTimeFormat("en", { weekday: "short" });

/** Compact relative time for lists: "now", "5m", "3h", "Mon", "Mar 4". */
export function relativeShort(at: number, now: number = Date.now()): string {
  const diff = now - at;
  if (diff < MINUTE) return "now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h`;
  if (diff < 7 * DAY) return weekday.format(at);
  return shortDate.format(at);
}

export function formatClock(at: number): string {
  return clock.format(at);
}

export function formatDateTime(at: number): string {
  return fullDate.format(at);
}

export function dayLabel(at: number, now: number = Date.now(), labels: { today: string; yesterday: string }): string {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (at >= start.getTime()) return labels.today;
  if (at >= start.getTime() - DAY) return labels.yesterday;
  return longDate.format(at);
}

/** "in 3 hours", "Tomorrow 9:00 AM", "Mon, Oct 12, 9:00 AM" for snooze labels. */
export function formatUntil(at: number, now: number = Date.now()): string {
  const sameDay = new Date(at).toDateString() === new Date(now).toDateString();
  if (sameDay) return clock.format(at);
  return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(at);
}

const weekdayTime = new Intl.DateTimeFormat("en", { weekday: "short", hour: "numeric", minute: "2-digit" });

/** Compact label for snooze presets: "1:42 AM", "Sun 9:00 AM", or a short date further out. */
export function formatShortUntil(at: number, now: number = Date.now()): string {
  if (new Date(at).toDateString() === new Date(now).toDateString()) return clock.format(at);
  if (at - now < 7 * DAY) return weekdayTime.format(at);
  return `${shortDate.format(at)}, ${clock.format(at)}`;
}

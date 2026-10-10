export type SnoozePreset = "hour" | "tomorrow" | "nextWeek";

const HOUR_MS = 3600_000;

function atNine(date: Date): Date {
  const next = new Date(date);
  next.setHours(9, 0, 0, 0);
  return next;
}

/** When a preset ends, in local time: tomorrow 9:00, or next Monday 9:00 (a week out when it is Monday). */
export function snoozeUntil(preset: SnoozePreset, now: number = Date.now()): number {
  const today = new Date(now);
  if (preset === "hour") return now + HOUR_MS;
  if (preset === "tomorrow") {
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    return atNine(tomorrow).getTime();
  }
  const daysToMonday = ((8 - today.getDay()) % 7) || 7;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + daysToMonday);
  return atNine(monday).getTime();
}

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInputValue(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

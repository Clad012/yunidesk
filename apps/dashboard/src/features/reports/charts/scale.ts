/** A round top for a count axis and its ticks: 0, step, 2·step … ≥ max (about 4 steps). */
export function countTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude);
  const ticks: number[] = [];
  for (let t = 0; t < max + step; t += step) ticks.push(Math.round(t * 100) / 100);
  return ticks.filter((t) => Number.isInteger(t));
}

const shortDate = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

/** "2026-10-18" → "Oct 18" (the date is already local; formatted as UTC so it never shifts). */
export function formatDay(date: string, long = false): string {
  return (long ? longDate : shortDate).format(Date.parse(`${date}T00:00:00Z`));
}

const hourFormat = new Intl.DateTimeFormat("en", { hour: "numeric", timeZone: "UTC" });

/** 0–23 → "12 AM" … "11 PM". */
export function formatHour(hour: number): string {
  return hourFormat.format(Date.UTC(2026, 0, 1, hour));
}

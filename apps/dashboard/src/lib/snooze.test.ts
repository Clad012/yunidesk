import { describe, expect, it } from "vitest";
import { snoozeUntil } from "./snooze";

const at = (y: number, m: number, d: number, h = 15) => new Date(y, m - 1, d, h, 30).getTime();
const local = (ms: number) => {
  const d = new Date(ms);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
};

describe("snoozeUntil", () => {
  it("one hour is exactly an hour", () => {
    expect(snoozeUntil("hour", at(2026, 10, 7)) - at(2026, 10, 7)).toBe(3600_000);
  });
  it("tomorrow is 9:00 the next day, across a month end", () => {
    expect(local(snoozeUntil("tomorrow", at(2026, 10, 31)))).toEqual([2026, 11, 1, 9, 0]);
  });
  it("next week is the coming Monday 9:00", () => {
    expect(local(snoozeUntil("nextWeek", at(2026, 10, 7)))).toEqual([2026, 10, 12, 9, 0]); // Wednesday
    expect(local(snoozeUntil("nextWeek", at(2026, 10, 11)))).toEqual([2026, 10, 12, 9, 0]); // Sunday
  });
  it("on a Monday, next week means the following Monday", () => {
    expect(local(snoozeUntil("nextWeek", at(2026, 10, 12, 7)))).toEqual([2026, 10, 19, 9, 0]);
  });
});

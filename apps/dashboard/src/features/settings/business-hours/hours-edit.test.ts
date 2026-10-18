import { describe, expect, it } from "vitest";
import { businessHoursProblem, type BusinessHours } from "yunidesk";
import { addHoliday, copyMondayToWeekdays, suggestRange } from "./hours-edit";

const hours: BusinessHours = {
  enabled: true,
  timezone: "Europe/Paris",
  week: [
    { day: 1, ranges: [{ from: "08:00", to: "12:00" }, { from: "13:00", to: "18:00" }] },
    { day: 3, ranges: [{ from: "10:00", to: "11:00" }] },
    { day: 6, ranges: [{ from: "10:00", to: "14:00" }] },
  ],
  holidays: ["2026-12-25"],
};

describe("editing business hours", () => {
  it("copies Monday to Tuesday–Friday only, leaving the weekend alone", () => {
    const next = copyMondayToWeekdays(hours);
    expect(next.week.map((d) => d.day)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(next.week.find((d) => d.day === 5)?.ranges).toEqual(hours.week[0]!.ranges);
    expect(next.week.find((d) => d.day === 6)?.ranges).toEqual([{ from: "10:00", to: "14:00" }]);
    const closedMonday = copyMondayToWeekdays({ ...hours, week: hours.week.slice(1) });
    expect(closedMonday.week.map((d) => d.day)).toEqual([6]);
  });

  it("suggests hours that never overlap, and nothing on a full day", () => {
    expect(suggestRange([])).toEqual({ from: "09:00", to: "17:00" });
    const after = suggestRange(hours.week[0]!.ranges)!;
    expect(after).toEqual({ from: "18:00", to: "19:00" });
    expect(businessHoursProblem({ ...hours, week: [{ day: 1, ranges: [...hours.week[0]!.ranges, after] }] })).toBeNull();
    expect(suggestRange([{ from: "23:30", to: "24:00" }])).toBeNull();
    expect(suggestRange([{ from: "22:00", to: "23:30" }])).toEqual({ from: "23:30", to: "24:00" });
    expect(suggestRange([{ from: "01:00", to: "02:00" }, { from: "03:00", to: "04:00" }, { from: "05:00", to: "06:00" }])).toBeNull();
  });

  it("keeps holidays unique and sorted", () => {
    expect(addHoliday(hours, "2026-12-25").problem).toBe("taken");
    expect(addHoliday(hours, "2026-11-11").hours.holidays).toEqual(["2026-11-11", "2026-12-25"]);
  });
});

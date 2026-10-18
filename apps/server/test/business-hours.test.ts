import { describe, expect, it } from "vitest";
import type { BusinessHours } from "yunidesk";
import { businessHoursSchema, sameClosedPeriod } from "../src/lib/business-hours";

const utc = (iso: string) => Date.parse(`${iso}Z`);
const paris: BusinessHours = {
  enabled: true,
  timezone: "Europe/Paris",
  week: [1, 2, 3, 4, 5].map((day) => ({ day, ranges: [{ from: "09:00", to: "17:00" }] })),
  holidays: [],
};

describe("the away message, once per closed period", () => {
  // Sent Friday 16 Oct 2026 at 18:00 Paris time.
  const sentAt = utc("2026-10-16T16:00:00");

  it("stays quiet for the rest of the weekend, and speaks again after the team was open", () => {
    expect(sameClosedPeriod(paris, null, sentAt)).toBe(false);
    expect(sameClosedPeriod(paris, sentAt, utc("2026-10-17T10:00:00"))).toBe(true); // Saturday
    expect(sameClosedPeriod(paris, sentAt, utc("2026-10-19T06:59:00"))).toBe(true); // Monday 08:59
    expect(sameClosedPeriod(paris, sentAt, utc("2026-10-19T16:00:00"))).toBe(false); // Monday 18:00
  });

  it("never repeats when the team never opens", () => {
    expect(sameClosedPeriod({ ...paris, week: [] }, sentAt, utc("2027-10-16T16:00:00"))).toBe(true);
  });
});

describe("business hours in PUT /settings", () => {
  it("rejects what the shared check refuses and stores the rest in order", () => {
    const overlapping = { ...paris, week: [{ day: 1, ranges: [{ from: "09:00", to: "13:00" }, { from: "12:00", to: "18:00" }] }] };
    expect(businessHoursSchema.safeParse(overlapping).success).toBe(false);
    expect(businessHoursSchema.safeParse({ ...paris, timezone: "Paris" }).success).toBe(false);
    const parsed = businessHoursSchema.parse({
      ...paris,
      week: [
        { day: 3, ranges: [{ from: "14:00", to: "18:00" }, { from: "09:00", to: "12:00" }] },
        { day: 1, ranges: [] },
      ],
      holidays: ["2026-12-25", "2026-11-11"],
    });
    expect(parsed.week).toEqual([{ day: 3, ranges: [{ from: "09:00", to: "12:00" }, { from: "14:00", to: "18:00" }] }]);
    expect(parsed.holidays).toEqual(["2026-11-11", "2026-12-25"]);
  });
});

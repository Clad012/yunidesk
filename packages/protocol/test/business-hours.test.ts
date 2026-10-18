import { describe, expect, it } from "vitest";
import {
  businessHoursProblem,
  formatBackAt,
  isAwayNow,
  isOpenAt,
  nextOpening,
  replyStatusLabel,
} from "../src/business-hours";
import { getStrings } from "../src/strings";
import type { BusinessHours } from "../src/types";

const utc = (iso: string) => Date.parse(`${iso}Z`);
const weekdays = (timezone: string, ranges = [{ from: "09:00", to: "17:00" }]): BusinessHours => ({
  enabled: true,
  timezone,
  week: [1, 2, 3, 4, 5].map((day) => ({ day, ranges })),
  holidays: [],
});
const sundays = (timezone: string, from: string, to: string): BusinessHours => ({
  enabled: true,
  timezone,
  week: [{ day: 0, ranges: [{ from, to }] }],
  holidays: [],
});

describe("isOpenAt", () => {
  const paris = weekdays("Europe/Paris");

  it("reads the hours in the team's zone, start included and end excluded", () => {
    // Friday 16 Oct 2026, Paris is UTC+2.
    expect(isOpenAt(paris, utc("2026-10-16T07:00:00"))).toBe(true); // 09:00
    expect(isOpenAt(paris, utc("2026-10-16T06:59:59"))).toBe(false); // 08:59:59
    expect(isOpenAt(paris, utc("2026-10-16T14:59:59"))).toBe(true); // 16:59:59
    expect(isOpenAt(paris, utc("2026-10-16T15:00:00"))).toBe(false); // 17:00
    expect(isOpenAt(paris, utc("2026-10-17T10:00:00"))).toBe(false); // Saturday
  });

  it("closes all day on a holiday, and is always open when the hours are off", () => {
    const christmas = { ...paris, holidays: ["2026-12-25"] };
    expect(isOpenAt(christmas, utc("2026-12-25T10:00:00"))).toBe(false);
    expect(isOpenAt(christmas, utc("2026-12-24T10:00:00"))).toBe(true);
    expect(isOpenAt({ ...christmas, enabled: false }, utc("2026-12-25T10:00:00"))).toBe(true);
  });

  it("treats 24:00 as the end of the day, so a late shift runs into the next day's", () => {
    const late: BusinessHours = {
      enabled: true,
      timezone: "UTC",
      week: [
        { day: 6, ranges: [{ from: "22:00", to: "24:00" }] },
        { day: 0, ranges: [{ from: "00:00", to: "02:00" }] },
      ],
      holidays: [],
    };
    expect(isOpenAt(late, utc("2026-10-17T23:59:59"))).toBe(true); // Saturday
    expect(isOpenAt(late, utc("2026-10-18T00:30:00"))).toBe(true); // Sunday
    expect(isOpenAt(late, utc("2026-10-18T02:00:00"))).toBe(false);
  });
});

describe("nextOpening", () => {
  it("is the instant itself while open", () => {
    const at = utc("2026-10-16T08:00:00");
    expect(nextOpening(weekdays("Europe/Paris"), at)).toBe(at);
  });

  it("finds the next range later the same day (after a lunch break)", () => {
    const split = weekdays("Europe/Paris", [
      { from: "09:00", to: "12:00" },
      { from: "14:00", to: "18:00" },
    ]);
    expect(nextOpening(split, utc("2026-10-16T10:30:00"))).toBe(utc("2026-10-16T12:00:00")); // 12:30 → 14:00
    expect(nextOpening(split, utc("2026-10-16T05:00:00"))).toBe(utc("2026-10-16T07:00:00")); // 07:00 → 09:00
  });

  it("skips the weekend in Paris, and uses the offset of the day it opens (clocks went back)", () => {
    // Friday 23 Oct 18:00 CEST → Monday 26 Oct 09:00 CET (UTC+1 after the 25 Oct change).
    expect(nextOpening(weekdays("Europe/Paris"), utc("2026-10-23T16:00:00"))).toBe(utc("2026-10-26T08:00:00"));
  });

  it("uses the summer offset after clocks went forward in Paris", () => {
    // Friday 27 Mar 18:00 CET → Monday 30 Mar 09:00 CEST (UTC+2 after the 29 Mar change).
    expect(nextOpening(weekdays("Europe/Paris"), utc("2026-03-27T17:00:00"))).toBe(utc("2026-03-30T07:00:00"));
  });

  it("opens when clocks jump forward into a range that starts in the skipped hour", () => {
    // 29 Mar 2026, Paris: 02:00 CET becomes 03:00 CEST at 01:00 UTC; 02:30 never happens.
    const hours = sundays("Europe/Paris", "02:30", "04:00");
    expect(nextOpening(hours, utc("2026-03-29T00:30:00"))).toBe(utc("2026-03-29T01:00:00"));
  });

  it("opens again when clocks go back into the middle of a range, then waits a week once it's over", () => {
    // 25 Oct 2026, Paris: 03:00 CEST becomes 02:00 CET at 01:00 UTC; 02:00–02:59 happens twice.
    const hours = sundays("Europe/Paris", "01:30", "02:30");
    expect(isOpenAt(hours, utc("2026-10-25T00:10:00"))).toBe(true); // first 02:10
    expect(nextOpening(hours, utc("2026-10-25T00:45:00"))).toBe(utc("2026-10-25T01:00:00")); // 02:45 CEST → 02:00 CET
    expect(nextOpening(hours, utc("2026-10-25T01:30:00"))).toBe(utc("2026-11-01T00:30:00")); // next Sunday 01:30 CET
  });

  it("opens on the morning of the change day with that day's offset", () => {
    // Saturday 24 Oct → Sunday 25 Oct 09:00, already CET (UTC+1).
    expect(nextOpening(sundays("Europe/Paris", "09:00", "17:00"), utc("2026-10-24T12:00:00"))).toBe(utc("2026-10-25T08:00:00"));
    // Sunday 25 Oct 00:30, still CEST (UTC+2): the change comes later that night.
    expect(nextOpening(sundays("Europe/Paris", "00:30", "01:00"), utc("2026-10-24T12:00:00"))).toBe(utc("2026-10-24T22:30:00"));
    // Saturday 28 Mar → Sunday 29 Mar 09:00, already CEST (UTC+2).
    expect(nextOpening(sundays("Europe/Paris", "09:00", "17:00"), utc("2026-03-28T12:00:00"))).toBe(utc("2026-03-29T07:00:00"));
  });

  it("handles New York's own change dates (2nd Sunday of March, 1st of November)", () => {
    const ny = weekdays("America/New_York");
    // Friday 6 Mar 18:00 EST → Monday 9 Mar 09:00 EDT (UTC-4).
    expect(nextOpening(ny, utc("2026-03-06T23:00:00"))).toBe(utc("2026-03-09T13:00:00"));
    // Friday 30 Oct 18:00 EDT → Monday 2 Nov 09:00 EST (UTC-5).
    expect(nextOpening(ny, utc("2026-10-30T22:00:00"))).toBe(utc("2026-11-02T14:00:00"));
  });

  it("skips holidays", () => {
    const hours = { ...weekdays("Europe/Paris"), holidays: ["2026-12-25"] };
    // Thursday 24 Dec 18:00 → Friday 25 is a holiday → Monday 28 Dec 09:00 CET.
    expect(nextOpening(hours, utc("2026-12-24T17:00:00"))).toBe(utc("2026-12-28T08:00:00"));
  });

  it("is null for a week with no hours at all", () => {
    expect(nextOpening({ enabled: true, timezone: "Europe/Paris", week: [], holidays: [] }, utc("2026-10-16T10:00:00"))).toBeNull();
  });
});

describe("businessHoursProblem", () => {
  const ok = weekdays("Europe/Paris");

  it("accepts sensible hours", () => {
    expect(businessHoursProblem(ok)).toBeNull();
    expect(businessHoursProblem({ ...ok, week: [{ day: 6, ranges: [{ from: "20:00", to: "24:00" }] }] })).toBeNull();
    expect(businessHoursProblem({ ...ok, week: [{ day: 1, ranges: [{ from: "09:00", to: "12:00" }, { from: "12:00", to: "13:00" }] }] })).toBeNull();
  });

  it("rejects unknown zones, bad times, overlaps, too many ranges and bad holidays", () => {
    const day = (ranges: { from: string; to: string }[]) => ({ ...ok, week: [{ day: 1, ranges }] });
    expect(businessHoursProblem({ ...ok, timezone: "Mars/Olympus" })).toMatch(/time zone/);
    expect(businessHoursProblem(day([{ from: "17:00", to: "09:00" }]))).toMatch(/before it ends/);
    expect(businessHoursProblem(day([{ from: "09:00", to: "09:00" }]))).toMatch(/before it ends/);
    expect(businessHoursProblem(day([{ from: "24:00", to: "24:00" }]))).toMatch(/before it ends/);
    expect(businessHoursProblem(day([{ from: "9:00", to: "17:00" }]))).toMatch(/times like/);
    expect(businessHoursProblem(day([{ from: "09:00", to: "24:01" }]))).toMatch(/times like/);
    expect(businessHoursProblem(day([{ from: "12:00", to: "14:00" }, { from: "09:00", to: "12:30" }]))).toMatch(/overlap/);
    const four = ["08", "10", "12", "14"].map((h) => ({ from: `${h}:00`, to: `${h}:30` }));
    expect(businessHoursProblem(day(four))).toMatch(/Up to 3/);
    expect(businessHoursProblem({ ...ok, week: [{ day: 7, ranges: [] }] })).toMatch(/0 \(Sunday\)/);
    expect(businessHoursProblem({ ...ok, week: [...ok.week, { day: 1, ranges: [] }] })).toMatch(/only once/);
    expect(businessHoursProblem({ ...ok, holidays: ["2026-02-30"] })).toMatch(/not a date/);
    expect(businessHoursProblem({ ...ok, holidays: ["2026-12-25", "2026-12-25"] })).toMatch(/only once/);
    const many = Array.from({ length: 101 }, (_, i) => new Date(Date.UTC(2027, 0, 1 + i)).toISOString().slice(0, 10));
    expect(businessHoursProblem({ ...ok, holidays: many })).toMatch(/Up to 100/);
    expect(businessHoursProblem({ ...ok, holidays: many.slice(0, 100) })).toBeNull();
  });
});

describe("what the messenger says", () => {
  const en = getStrings("en");
  const fr = getStrings("fr");
  // Local times: the customer's own zone, whatever the machine running the tests uses.
  const friday6pm = new Date(2026, 9, 16, 18, 0).getTime();

  it("names the day relative to the customer's today", () => {
    expect(formatBackAt(en, new Date(2026, 9, 16, 20, 0).getTime(), friday6pm, "en")).toMatch(/^today at /);
    expect(formatBackAt(fr, new Date(2026, 9, 17, 9, 0).getTime(), friday6pm, "fr")).toMatch(/^demain à /);
    expect(formatBackAt(en, new Date(2026, 9, 19, 9, 0).getTime(), friday6pm, "en")).toMatch(/^Monday at /);
    expect(formatBackAt(fr, new Date(2026, 9, 19, 9, 0).getTime(), friday6pm, "fr")).toMatch(/^lundi à /);
    expect(formatBackAt(en, new Date(2026, 9, 23, 9, 0).getTime(), friday6pm, "en")).toMatch(/^on October 23 at /);
  });

  it("says when the team is back while away, and the reply time once it is back", () => {
    const back = new Date(2026, 9, 19, 9, 0).getTime();
    const config = { replyTime: "hour" as const, availability: { open: false, nextOpenAt: back } };
    expect(replyStatusLabel(en, config, friday6pm, "en")).toMatch(/^We're away — back Monday at /);
    expect(replyStatusLabel(en, config, back, "en")).toBe(en.replyTime_hour);
    expect(replyStatusLabel(en, { ...config, availability: { open: false, nextOpenAt: null } }, friday6pm)).toBe(en.awayNoReturn);
    expect(replyStatusLabel(en, { replyTime: "hour" }, friday6pm)).toBe(en.replyTime_hour);
    expect(isAwayNow({ open: true, nextOpenAt: null }, friday6pm)).toBe(false);
  });
});

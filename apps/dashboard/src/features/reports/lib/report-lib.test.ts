import { describe, expect, it } from "vitest";
import { compareMetric, formatDuration } from "./format";
import { isValidRange, presetRange, todayIn } from "./range";

describe("durations", () => {
  it("reads like a person would say it", () => {
    expect(formatDuration(45_000)).toBe("45 s");
    expect(formatDuration(4 * 60_000 + 10_000)).toBe("4 min");
    expect(formatDuration(59 * 60_000 + 40_000)).toBe("1 h");
    expect(formatDuration(130 * 60_000)).toBe("2 h 10 min");
    expect(formatDuration(3 * 86_400_000 + 4 * 3_600_000)).toBe("3 d 4 h");
    expect(formatDuration(12 * 86_400_000 + 4 * 3_600_000)).toBe("12 d");
    expect(formatDuration(null)).toBe("—");
  });
});

describe("comparisons", () => {
  it("counts and durations change in percent, rates in points, nothing from zero", () => {
    expect(compareMetric(12, 10, "count")).toEqual({ text: "+20%", direction: "up" });
    expect(compareMetric(9, 10, "duration")).toEqual({ text: "−10%", direction: "down" });
    expect(compareMetric(0.75, 0.7, "rate")).toEqual({ text: "+5 pts", direction: "up" });
    expect(compareMetric(5, 0, "count")).toBeNull();
    expect(compareMetric(null, 3, "duration")).toBeNull();
  });
});

describe("periods", () => {
  it("counts today in the viewer's zone and includes it in the presets", () => {
    const now = Date.parse("2026-10-18T23:30:00Z");
    expect(todayIn("Europe/Paris", now)).toBe("2026-10-19");
    expect(todayIn("America/New_York", now)).toBe("2026-10-18");
    expect(presetRange("7d", "2026-10-19")).toEqual({ from: "2026-10-13", to: "2026-10-19" });
    expect(presetRange("today", "2026-03-01")).toEqual({ from: "2026-03-01", to: "2026-03-01" });
    expect(isValidRange("2026-10-01", "2026-10-01")).toBe(true);
    expect(isValidRange("2026-10-02", "2026-10-01")).toBe(false);
    expect(isValidRange("2026-02-30", "2026-03-01")).toBe(false);
    expect(isValidRange("2025-01-01", "2026-01-02")).toBe(false);
  });
});

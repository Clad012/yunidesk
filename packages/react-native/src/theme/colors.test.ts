import { describe, expect, it } from "vitest";
import { DARK_TEXT, LIGHT_TEXT, accentColor, contrastRatio, parseHexColor, readableTextColor } from "./colors";

describe("readableTextColor", () => {
  it("puts white on dark brands and near-black on light ones", () => {
    expect(readableTextColor("#4F46E5")).toBe(LIGHT_TEXT);
    expect(readableTextColor("#000")).toBe(LIGHT_TEXT);
    expect(readableTextColor("#FACC15")).toBe(DARK_TEXT);
    expect(readableTextColor("#ffffff")).toBe(DARK_TEXT);
  });

  it("flips around mid-grey, where the two contrasts cross", () => {
    // #787878 is the first grey where near-black beats white on WCAG contrast.
    expect(readableTextColor("#777777")).toBe(LIGHT_TEXT);
    expect(readableTextColor("#787878")).toBe(DARK_TEXT);
  });

  it("falls back to white for colours it cannot parse", () => {
    expect(readableTextColor("rebeccapurple")).toBe(LIGHT_TEXT);
    expect(parseHexColor("#12345")).toBeNull();
  });

  it("computes the WCAG ratio", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
  });
});

describe("accentColor", () => {
  it("keeps a brand that stands out and falls back to the text colour when it would vanish", () => {
    // Near-black brand: invisible on a dark screen, fine on a white one.
    expect(accentColor("#1f1d20", "#0B0B0F", "#F4F4F5")).toBe("#F4F4F5");
    expect(accentColor("#1f1d20", "#FFFFFF", "#111827")).toBe("#1f1d20");
    // Light yellow brand on white is the opposite case.
    expect(accentColor("#FACC15", "#FFFFFF", "#111827")).toBe("#111827");
    expect(accentColor("#4F46E5", "#FFFFFF", "#111827")).toBe("#4F46E5");
  });
});

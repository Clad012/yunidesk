import { describe, expect, it } from "vitest";
import { DARK_TEXT, LIGHT_TEXT, contrastRatio, parseHexColor, readableTextColor } from "./colors";

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

import { describe, expect, it } from "vitest";
import { brandTheme, contrastRatio, inkOn, parseHex, textOn } from "./color";

const WHITE = [255, 255, 255] as const;

describe("brand colour readability", () => {
  it("parses short and long hex, rejects the rest", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("6d5dfc")).toEqual([109, 93, 252]);
    expect(parseHex("red")).toBeNull();
    expect(parseHex("#12345")).toBeNull();
  });

  it("puts white text on dark brands and dark text on light brands", () => {
    expect(textOn([20, 40, 120])).toEqual(WHITE);
    expect(textOn([255, 221, 87])).not.toEqual(WHITE);
    // Mid-tone around the switch point: pick whichever contrasts more.
    const mid = [118, 118, 118] as const;
    const chosen = textOn(mid);
    const other = chosen[0] === 255 ? ([17, 17, 24] as const) : WHITE;
    expect(contrastRatio(mid, chosen)).toBeGreaterThanOrEqual(contrastRatio(mid, other));
  });

  it("darkens a pale brand until text in that colour passes AA on white", () => {
    const pale = parseHex("#ffe066")!;
    expect(contrastRatio(pale, WHITE)).toBeLessThan(4.5);
    expect(contrastRatio(inkOn(pale, WHITE), WHITE)).toBeGreaterThanOrEqual(4.5);
  });

  it("leaves a brand that already passes untouched", () => {
    const deep = parseHex("#1f3a93")!;
    expect(inkOn(deep, WHITE)).toEqual(deep);
  });

  it("falls back to the default brand on an invalid colour and always yields readable text", () => {
    expect(brandTheme("not a colour").brand).toBe("#6d5dfc");
    for (const input of ["#ffffff", "#000000", "#ffe066", "#00c2a8", "#e11d48"]) {
      const theme = brandTheme(input);
      expect(contrastRatio(parseHex(theme.brand)!, parseHex(theme.onBrand)!)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(parseHex(theme.inkLight)!, WHITE)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

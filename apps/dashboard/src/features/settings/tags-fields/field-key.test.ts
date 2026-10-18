import { describe, expect, it } from "vitest";
import { FIELD_KEY_PATTERN, fieldKeyFromLabel } from "./field-key";

describe("field keys from labels", () => {
  it("folds accents, spaces and punctuation into a valid key", () => {
    expect(fieldKeyFromLabel("Numéro de commande")).toBe("numero_de_commande");
    expect(fieldKeyFromLabel("  Plan (billing) ")).toBe("plan_billing");
    expect(fieldKeyFromLabel("2FA enabled?")).toBe("f_2fa_enabled");
  });

  it("never ends on _ when cut to 40 characters, and always matches the server's pattern", () => {
    const key = fieldKeyFromLabel(`${"a".repeat(39)} b`);
    expect(key).toBe("a".repeat(39));
    for (const label of ["Numéro de commande", "2FA enabled?", "x".repeat(80), "Ünïcödé — test"]) {
      expect(fieldKeyFromLabel(label)).toMatch(FIELD_KEY_PATTERN);
    }
    expect(fieldKeyFromLabel("!!!")).toBe("");
  });
});

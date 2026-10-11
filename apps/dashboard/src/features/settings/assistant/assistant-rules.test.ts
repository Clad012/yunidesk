import { describe, expect, it } from "vitest";
import type { AssistantSettings } from "yunidesk";
import { assistantFormErrors, changedFields } from "./assistant-form-rules";
import { parseInputSchema, TOOL_NAME } from "./tools/tool-rules";

const saved: AssistantSettings = {
  enabled: false,
  name: "Acme assistant",
  instructions: "",
  model: "z-ai/glm-5.3-flash",
  allowAnonymous: true,
  dailyBudgetUsd: 2,
  hasOpenRouterKey: true,
};

describe("parseInputSchema", () => {
  it("accepts a JSON object whose type is object", () => {
    expect(parseInputSchema('{"type":"object","properties":{"orderId":{"type":"string"}}}')).toEqual({
      ok: true,
      schema: { type: "object", properties: { orderId: { type: "string" } } },
    });
  });
  it("rejects text that isn't JSON", () => {
    expect(parseInputSchema("{type: object}").ok).toBe(false);
  });
  it("rejects JSON that isn't an object schema", () => {
    for (const text of ['["type","object"]', "null", '"object"', '{"type":"string"}', '{"properties":{}}']) {
      expect(parseInputSchema(text).ok, text).toBe(false);
    }
  });
});

describe("TOOL_NAME", () => {
  it("takes snake_case starting with a letter, 2 to 41 characters", () => {
    expect(TOOL_NAME.test("get_order_status")).toBe(true);
    expect(TOOL_NAME.test("a1")).toBe(true);
    expect(TOOL_NAME.test(`a${"b".repeat(40)}`)).toBe(true);
  });
  it("refuses other shapes", () => {
    for (const name of ["a", "1abc", "_abc", "getOrder", "get-order", `a${"b".repeat(41)}`]) {
      expect(TOOL_NAME.test(name), name).toBe(false);
    }
  });
});

describe("assistant form", () => {
  it("sends only the fields that really changed", () => {
    expect(changedFields(saved, { name: "Acme assistant", dailyBudgetUsd: 3, enabled: false })).toEqual({ dailyBudgetUsd: 3 });
  });
  it("needs a daily budget of at least $0.50", () => {
    expect(assistantFormErrors({ ...saved, dailyBudgetUsd: 0.5 }).dailyBudgetUsd).toBeNull();
    expect(assistantFormErrors({ ...saved, dailyBudgetUsd: 0.49 }).dailyBudgetUsd).not.toBeNull();
    expect(assistantFormErrors({ ...saved, dailyBudgetUsd: Number.NaN }).dailyBudgetUsd).not.toBeNull();
  });
  it("needs an OpenRouter model id and a name", () => {
    expect(assistantFormErrors({ ...saved, model: "openai/gpt-5.1:online" }).model).toBeNull();
    expect(assistantFormErrors({ ...saved, model: "gpt-5" }).model).not.toBeNull();
    expect(assistantFormErrors({ ...saved, name: "  " }).name).not.toBeNull();
  });
});

import { TYPING_TTL_MS } from "yunidesk";
import { describe, expect, it } from "vitest";
import { applyTyping, expireTyping } from "./typing";

const ana = { id: "ana", name: "Ana", avatarUrl: null };

describe("typing", () => {
  it("expires an indicator that was not refreshed within the TTL", () => {
    const state = applyTyping({}, { conversationId: "c1", by: "agent", agent: ana, isTyping: true }, 0);
    expect(expireTyping(state, TYPING_TTL_MS - 1).c1?.agents.ana).toBeDefined();
    expect(expireTyping(state, TYPING_TTL_MS + 1).c1).toBeUndefined();
  });
  it("isTyping false removes only that teammate", () => {
    const bob = { ...ana, id: "bob", name: "Bob" };
    let state = applyTyping({}, { conversationId: "c1", by: "agent", agent: ana, isTyping: true }, 0);
    state = applyTyping(state, { conversationId: "c1", by: "agent", agent: bob, isTyping: true }, 0);
    state = applyTyping(state, { conversationId: "c1", by: "agent", agent: ana, isTyping: false }, 1);
    expect(Object.keys(state.c1!.agents)).toEqual(["bob"]);
  });
  it("returns the same object when nothing expired, so stores don't re-render", () => {
    const state = applyTyping({}, { conversationId: "c1", by: "contact", isTyping: true }, 0);
    expect(expireTyping(state, 1)).toBe(state);
  });
});

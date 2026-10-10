import { describe, expect, it } from "vitest";
import { isContactServerEvent } from "../src/events";

describe("isContactServerEvent", () => {
  it("drops frames that would crash the reducer and keeps real events", () => {
    expect(isContactServerEvent({ type: "message.created" })).toBe(false);
    expect(isContactServerEvent({ type: "typing", conversationId: "c", isTyping: true })).toBe(false);
    expect(isContactServerEvent({ type: "pong" })).toBe(false);
    expect(isContactServerEvent("ready")).toBe(false);
    expect(
      isContactServerEvent({ type: "message.created", message: { id: "m", conversationId: "c" }, conversation: { id: "c" } }),
    ).toBe(true);
    expect(isContactServerEvent({ type: "typing", conversationId: "c", isTyping: true, agent: { id: "a", name: "Ana" } })).toBe(true);
  });
});

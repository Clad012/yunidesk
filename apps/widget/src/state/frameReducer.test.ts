import { describe, expect, it } from "vitest";
import { initialMessengerState } from "yunidesk";
import { frameReducer } from "./frameReducer";

describe("frameReducer", () => {
  it("lets the assistant's live reply through to the state", () => {
    const conversationId = "cnv_1";
    let state = frameReducer(initialMessengerState, {
      type: "event",
      event: { type: "assistant.status", conversationId, streamId: "s1", status: "thinking" },
    });
    expect(state.assistantDrafts[conversationId]?.status).toBe("thinking");
    state = frameReducer(state, {
      type: "event",
      event: { type: "assistant.delta", conversationId, streamId: "s1", text: "Hello" },
    });
    expect(state.assistantDrafts[conversationId]).toEqual({ streamId: "s1", text: "Hello", status: "writing" });
  });
});

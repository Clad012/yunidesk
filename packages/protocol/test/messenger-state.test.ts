import { describe, expect, it } from "vitest";
import {
  buildTimeline,
  initialMessengerState,
  lastSeenMessageId,
  mergeMessages,
  messengerReducer,
  upsertConversation,
  type TimelineMessage,
} from "../src/messenger-state";
import type { ContactConversation, PublicAgent } from "../src/types";

const T0 = new Date(2026, 9, 10, 9, 0).getTime();
const ana: PublicAgent = { id: "agt_ana", name: "Ana", avatarUrl: null };
const bob: PublicAgent = { id: "agt_bob", name: "Bob", avatarUrl: null };

function msg(id: string, at: number, extra: Partial<TimelineMessage> = {}): TimelineMessage {
  return {
    id,
    conversationId: "cnv_1",
    authorType: "contact",
    agent: null,
    kind: "text",
    body: id,
    event: null,
    attachments: [],
    clientId: null,
    createdAt: at,
    ...extra,
  };
}

function conv(id: string, lastMessageAt: number, updatedAt = lastMessageAt): ContactConversation {
  return {
    id,
    status: "open",
    createdAt: 0,
    updatedAt,
    lastMessageAt,
    lastMessage: null,
    unreadCount: 0,
    agentLastReadAt: null,
    participants: [],
    rating: null,
  };
}

describe("mergeMessages", () => {
  it("replaces the optimistic message with the server copy and never goes back", () => {
    const pending = msg("tmp", T0, { clientId: "c1", delivery: "sending" });
    const confirmed = msg("msg_1", T0 + 5, { clientId: "c1" });
    const merged = mergeMessages([pending], [confirmed]);
    expect(merged).toEqual([confirmed]);
    // A late optimistic echo (e.g. a retry) must not hide the confirmed message.
    expect(mergeMessages(merged, [pending])).toEqual([confirmed]);
  });

  it("orders by time", () => {
    expect(mergeMessages([msg("b", T0 + 2)], [msg("a", T0 + 1)]).map((m) => m.id)).toEqual(["a", "b"]);
  });
});

describe("upsertConversation", () => {
  it("ignores an older snapshot and keeps the newest first", () => {
    const list = [conv("a", T0 + 10, T0 + 10), conv("b", T0)];
    expect(upsertConversation(list, conv("a", T0 + 10, T0 + 5))).toBe(list);
    expect(upsertConversation(list, conv("b", T0 + 20)).map((c) => c.id)).toEqual(["b", "a"]);
  });
});

describe("messengerReducer", () => {
  it("keeps state for frames it doesn't know, like the server's pong", () => {
    const pong = { type: "pong" } as unknown as Parameters<typeof messengerReducer>[1] extends infer A
      ? A extends { type: "event"; event: infer E } ? E : never
      : never;
    expect(messengerReducer(initialMessengerState, { type: "event", event: pong })).toBe(initialMessengerState);
  });

  it("a teammate's reply clears their typing bubble", () => {
    let state = messengerReducer(initialMessengerState, {
      type: "event",
      event: { type: "typing", conversationId: "cnv_1", agent: ana, isTyping: true },
      now: T0,
    });
    expect(state.typing.cnv_1?.agent.id).toBe("agt_ana");
    state = messengerReducer(state, {
      type: "event",
      event: { type: "message.created", message: msg("m", T0, { authorType: "agent", agent: ana }), conversation: conv("cnv_1", T0) },
    });
    expect(state.typing.cnv_1).toBeUndefined();
  });

  it("marks only the matching optimistic message as failed", () => {
    let state = messengerReducer(initialMessengerState, {
      type: "optimistic",
      conversationId: "cnv_1",
      message: msg("tmp1", T0, { clientId: "c1", delivery: "sending" }),
    });
    state = messengerReducer(state, { type: "optimistic", conversationId: "cnv_1", message: msg("tmp2", T0 + 1, { clientId: "c2", delivery: "sending" }) });
    state = messengerReducer(state, { type: "failed", conversationId: "cnv_1", clientId: "c2" });
    expect(state.threads.cnv_1!.messages.map((m) => m.delivery)).toEqual(["sending", "failed"]);
  });
});

describe("buildTimeline", () => {
  it("groups by author within five minutes and splits on days and events", () => {
    const items = buildTimeline([
      msg("1", T0),
      msg("2", T0 + 60_000),
      msg("3", T0 + 7 * 60_000), // gap > 5 min
      msg("4", T0 + 8 * 60_000, { authorType: "agent", agent: ana }),
      msg("5", T0 + 8 * 60_000 + 1, { authorType: "agent", agent: bob }), // other teammate
      msg("6", T0 + 9 * 60_000, { authorType: "system", kind: "event" }),
      msg("7", T0 + 24 * 3600_000),
    ]);
    expect(items.map((i) => (i.type === "group" ? i.messages.map((m) => m.id).join("+") : i.type))).toEqual([
      "day",
      "1+2",
      "3",
      "4",
      "5",
      "event",
      "day",
      "7",
    ]);
  });
});

describe("lastSeenMessageId", () => {
  it("points at the last contact message read before any team reply", () => {
    const messages = [msg("a", T0), msg("b", T0 + 10), msg("c", T0 + 20)];
    expect(lastSeenMessageId(messages, T0 + 15)).toBe("b");
    expect(lastSeenMessageId([...messages, msg("r", T0 + 30, { authorType: "agent", agent: ana })], T0 + 40)).toBeNull();
  });
});

describe("assistant replies while they are written", () => {
  const conversationId = "cnv_1";
  const ev = (event: Parameters<typeof messengerReducer>[1] extends infer A ? A : never) => event;
  it("shows thinking, then growing text, never shrinking, and gives way to the final message", async () => {
    const { messengerReducer, initialMessengerState } = await import("../src/messenger-state");
    let state = messengerReducer(initialMessengerState, ev({ type: "event", event: { type: "assistant.status", conversationId, streamId: "s1", status: "thinking" } }));
    expect(state.assistantDrafts[conversationId]).toEqual({ streamId: "s1", text: "", status: "thinking" });
    state = messengerReducer(state, ev({ type: "event", event: { type: "assistant.delta", conversationId, streamId: "s1", text: "Hello the" } }));
    state = messengerReducer(state, ev({ type: "event", event: { type: "assistant.delta", conversationId, streamId: "s1", text: "Hello" } }));
    expect(state.assistantDrafts[conversationId]?.text).toBe("Hello the");
    const message = { id: "msg_1", conversationId, authorType: "agent" as const, agent: null, kind: "text" as const, body: "Hello there", event: null, attachments: [], clientId: null, createdAt: 1, ai: true };
    const conversation = { id: conversationId, status: "open", createdAt: 1, updatedAt: 1, lastMessageAt: 1, lastMessage: null, unreadCount: 1, agentLastReadAt: null, participants: [], rating: null } as never;
    state = messengerReducer(state, ev({ type: "event", event: { type: "message.created", message, conversation } }));
    expect(state.assistantDrafts[conversationId]).toBeUndefined();
  });

  it("drops a failed reply, but not when the failure is about an older one", async () => {
    const { messengerReducer, initialMessengerState } = await import("../src/messenger-state");
    let state = messengerReducer(initialMessengerState, ev({ type: "event", event: { type: "assistant.delta", conversationId, streamId: "s2", text: "Hi" } }));
    state = messengerReducer(state, ev({ type: "event", event: { type: "assistant.status", conversationId, streamId: "s1", status: "failed" } }));
    expect(state.assistantDrafts[conversationId]?.text).toBe("Hi");
    state = messengerReducer(state, ev({ type: "event", event: { type: "assistant.status", conversationId, streamId: "s2", status: "failed" } }));
    expect(state.assistantDrafts[conversationId]).toBeUndefined();
  });
});

describe("timeline groups", () => {
  it("never puts an AI reply in the same group as a teammate's", async () => {
    const { buildTimeline } = await import("../src/messenger-state");
    const base = { conversationId: "cnv_1", authorType: "agent" as const, agent: null, kind: "text" as const, event: null, attachments: [], clientId: null };
    const items = buildTimeline([
      { ...base, id: "m1", body: "From a person", createdAt: 1 },
      { ...base, id: "m2", body: "From the AI", createdAt: 2, ai: true },
      { ...base, id: "m3", body: "AI again", createdAt: 3, ai: true },
    ]);
    const groups = items.filter((item) => item.type === "group");
    expect(groups.map((group) => (group.type === "group" ? group.messages.map((m) => m.id) : []))).toEqual([["m1"], ["m2", "m3"]]);
  });
});

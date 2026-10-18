import { describe, expect, it } from "vitest";
import { conversation, message } from "@/test/fixtures";
import {
  flattenMessages,
  matchesFilters,
  matchesView,
  upsertConversation,
  upsertMessage,
  type ConversationPages,
  type MessagePages,
} from "./inbox-cache";

const pages = (...lists: { ids: [string, number][]; next: string | null }[]): ConversationPages => ({
  pages: lists.map((l) => ({ items: l.ids.map(([id, at]) => conversation(id, at)), nextCursor: l.next })),
  pageParams: lists.map(() => null),
});
const ids = (data: ConversationPages) => data.pages.map((p) => p.items.map((c) => c.id));

describe("matchesView", () => {
  const me = { id: "me", name: "Me", avatarUrl: null };
  it("keeps only my open conversations in mine", () => {
    expect(matchesView(conversation("a", 1, { assignee: me }), "mine", "me")).toBe(true);
    expect(matchesView(conversation("a", 1, { assignee: me, status: "snoozed" }), "mine", "me")).toBe(false);
    expect(matchesView(conversation("a", 1, { assignee: { ...me, id: "ana" } }), "mine", "me")).toBe(false);
  });
  it("unassigned means open and nobody assigned", () => {
    expect(matchesView(conversation("a", 1), "unassigned", "me")).toBe(true);
    expect(matchesView(conversation("a", 1, { status: "resolved" }), "unassigned", "me")).toBe(false);
  });
});

describe("upsertConversation", () => {
  it("moves an updated conversation to its sorted place", () => {
    const data = pages({ ids: [["a", 30], ["b", 20], ["c", 10]], next: null });
    expect(ids(upsertConversation(data, conversation("c", 40), true))).toEqual([["c", "a", "b"]]);
  });
  it("breaks ties on id descending like the server", () => {
    const data = pages({ ids: [["a", 30]], next: null });
    expect(ids(upsertConversation(data, conversation("b", 30), true))).toEqual([["b", "a"]]);
  });
  it("removes a conversation that left the view", () => {
    const data = pages({ ids: [["a", 30], ["b", 20]], next: null });
    expect(ids(upsertConversation(data, conversation("a", 30), false))).toEqual([["b"]]);
  });
  it("leaves out an old conversation when more pages exist, but appends it on the last page", () => {
    expect(ids(upsertConversation(pages({ ids: [["a", 30]], next: "cur" }), conversation("z", 1), true))).toEqual([["a"]]);
    expect(ids(upsertConversation(pages({ ids: [["a", 30]], next: null }), conversation("z", 1), true))).toEqual([["a", "z"]]);
  });
});

describe("tag and priority filters", () => {
  const billing = { id: "tag_billing", name: "Billing", color: "red" as const };
  it("keeps a list to its tag and priority", () => {
    const tagged = conversation("a", 1, { tags: [billing], priority: "urgent" });
    expect(matchesFilters(tagged, { tag: "tag_billing" })).toBe(true);
    expect(matchesFilters(conversation("b", 1), { tag: "tag_billing" })).toBe(false);
    expect(matchesFilters(tagged, { tag: "tag_billing", priority: "high" })).toBe(false);
    expect(matchesFilters(tagged, { priority: "urgent", sort: "priority" })).toBe(true);
  });

  it("places by priority first, then newest, when the list is sorted by priority", () => {
    const data: ConversationPages = {
      pages: [{ items: [conversation("u", 10, { priority: "urgent" }), conversation("n1", 50), conversation("n2", 20), conversation("l", 99, { priority: "low" })], nextCursor: null }],
      pageParams: [null],
    };
    expect(ids(upsertConversation(data, conversation("h", 5, { priority: "high" }), true, "priority"))).toEqual([["u", "h", "n1", "n2", "l"]]);
    expect(ids(upsertConversation(data, conversation("n3", 30), true, "priority"))).toEqual([["u", "n1", "n3", "n2", "l"]]);
    expect(ids(upsertConversation(data, conversation("h", 5, { priority: "high" }), true))).toEqual([["u", "n1", "n2", "l", "h"]]);
  });
});

describe("messages", () => {
  const data = (): MessagePages => ({ pages: [{ items: [message("m2", 20)], nextCursor: "m1" }, { items: [message("m1", 10)], nextCursor: null }], pageParams: [null, "m2"] });

  it("replaces the optimistic copy by clientId instead of duplicating it", () => {
    const optimistic = { ...message("local_x", 30, { authorType: "agent", clientId: "x" }), delivery: "sending" as const };
    const withOptimistic = upsertMessage(data(), optimistic);
    const confirmed = upsertMessage(withOptimistic, message("m3", 31, { authorType: "agent", clientId: "x" }));
    expect(flattenMessages(confirmed).map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
  });
  it("never downgrades a confirmed message back to sending", () => {
    const confirmed = upsertMessage(data(), message("m3", 31, { clientId: "x" }));
    const stale = upsertMessage(confirmed, { ...message("local_x", 30, { clientId: "x" }), delivery: "sending" });
    expect(flattenMessages(stale).find((m) => m.clientId === "x")?.id).toBe("m3");
  });
  it("flattens older pages first", () => {
    expect(flattenMessages(data()).map((m) => m.id)).toEqual(["m1", "m2"]);
  });
});

import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { conversation, message } from "@/test/fixtures";
import { queryKeys } from "../endpoints";
import type { ConversationPages, MessagePages } from "../inbox-cache";
import { applyEvent } from "./apply-event";
import { typingStore } from "./live";

const me = { id: "me", name: "Me", avatarUrl: null };

function setup() {
  const qc = new QueryClient();
  const list = (items: ReturnType<typeof conversation>[]): ConversationPages => ({ pages: [{ items, nextCursor: null }], pageParams: [null] });
  qc.setQueryData(queryKeys.conversationList("mine", ""), list([conversation("c1", 10, { assignee: me })]));
  qc.setQueryData(queryKeys.conversationList("unassigned", ""), list([conversation("c2", 5)]));
  qc.setQueryData(queryKeys.conversationList("all", "refund"), list([conversation("c2", 5)]));
  qc.setQueryData<MessagePages>(queryKeys.messages("c1"), { pages: [{ items: [message("m1", 10)], nextCursor: null }], pageParams: [null] });
  return qc;
}
const listIds = (qc: QueryClient, view: "mine" | "unassigned", q = "") =>
  qc.getQueryData<ConversationPages>(queryKeys.conversationList(view, q))!.pages[0]!.items.map((c) => c.id);

describe("applyEvent", () => {
  it("message.created appends to the open thread and clears the contact's typing", () => {
    const qc = setup();
    typingStore.set({ c1: { contactUntil: Date.now() + 5000, agents: {} } });
    applyEvent(qc, { type: "message.created", message: message("m2", 20, { conversationId: "c1" }), conversation: conversation("c1", 20, { assignee: me }) }, "me");
    const thread = qc.getQueryData<MessagePages>(queryKeys.messages("c1"))!;
    expect(thread.pages[0]!.items.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(typingStore.get().c1?.contactUntil ?? null).toBeNull();
  });

  it("moves a conversation between views when it is assigned", () => {
    const qc = setup();
    applyEvent(qc, { type: "conversation.updated", conversation: conversation("c2", 5, { assignee: me }) }, "me");
    expect(listIds(qc, "unassigned")).toEqual([]);
    expect(listIds(qc, "mine")).toEqual(["c1", "c2"]);
  });

  it("search results are patched in place, never filtered by view", () => {
    const qc = setup();
    applyEvent(qc, { type: "conversation.updated", conversation: conversation("c2", 5, { status: "resolved" }) }, "me");
    expect(listIds(qc, "unassigned")).toEqual([]);
    const search = qc.getQueryData<ConversationPages>(queryKeys.conversationList("all", "refund"))!;
    expect(search.pages[0]!.items[0]!.status).toBe("resolved");
  });

  it("conversation.read from the contact drives Seen; from the team clears unread", () => {
    const qc = setup();
    qc.setQueryData(queryKeys.conversation("c1"), conversation("c1", 10, { unread: true }));
    applyEvent(qc, { type: "conversation.read", conversationId: "c1", by: "contact", at: 99 }, "me");
    expect(qc.getQueryData<ReturnType<typeof conversation>>(queryKeys.conversation("c1"))!.contactLastReadAt).toBe(99);
    applyEvent(qc, { type: "conversation.read", conversationId: "c1", by: "agent", at: 100 }, "me");
    expect(qc.getQueryData<ReturnType<typeof conversation>>(queryKeys.conversation("c1"))!.unread).toBe(false);
  });

  it("contact.deleted removes their conversations everywhere", () => {
    const qc = setup();
    applyEvent(qc, { type: "contact.deleted", contactId: "ctc_c1" }, "me");
    expect(listIds(qc, "mine")).toEqual([]);
    expect(listIds(qc, "unassigned")).toEqual(["c2"]);
  });
});

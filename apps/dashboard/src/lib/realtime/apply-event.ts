import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type { AgentConversation, AgentServerEvent, Contact, Page } from "yunidesk";
import { queryKeys, type Bootstrap, type InboxView, type ListFilters } from "../endpoints";
import {
  matchesFilters,
  matchesView,
  patchContact,
  patchConversation,
  removeContact,
  upsertConversation,
  upsertMessage,
  type ConversationPages,
  type MessagePages,
} from "../inbox-cache";
import { presenceStore, typingStore } from "./live";
import { applyTyping } from "./typing";

type ContactDetail = { contact: Contact; conversations: AgentConversation[] };
type ContactPages = InfiniteData<Page<Contact>, string | null>;

let countsTimer: ReturnType<typeof setTimeout> | null = null;
function refreshCounts(qc: QueryClient): void {
  if (countsTimer) clearTimeout(countsTimer);
  countsTimer = setTimeout(() => {
    void qc.invalidateQueries({ queryKey: queryKeys.counts });
    // Per-tag and per-team open counts in the views pane.
    void qc.invalidateQueries({ queryKey: queryKeys.tags });
    void qc.invalidateQueries({ queryKey: queryKeys.teams });
  }, 250);
}

/** Folds a conversation snapshot into every cached list, the detail and the contact page. */
export function applyConversation(qc: QueryClient, conversation: AgentConversation, meId: string): void {
  if (qc.getQueryData(queryKeys.conversation(conversation.id))) {
    qc.setQueryData(queryKeys.conversation(conversation.id), conversation);
  }
  for (const [key, data] of qc.getQueriesData<ConversationPages>({ queryKey: queryKeys.conversationLists })) {
    if (!data) continue;
    const [, view, q, contactId, rawFilters] = key as ReturnType<typeof queryKeys.conversationList>;
    const filters: ListFilters = rawFilters ?? {};
    let next: ConversationPages;
    if (q) next = patchConversation(data, conversation.id, () => conversation);
    else if (contactId && contactId !== conversation.contact.id) continue;
    else {
      const belongs = matchesView(conversation, view as InboxView, meId) && matchesFilters(conversation, filters);
      next = upsertConversation(data, conversation, belongs, filters.sort === "priority" ? "priority" : "recent");
    }
    if (next !== data) qc.setQueryData(key, next);
  }
  qc.setQueryData<ContactDetail>(queryKeys.contact(conversation.contact.id), (detail) => {
    if (!detail) return detail;
    const others = detail.conversations.filter((c) => c.id !== conversation.id);
    return { ...detail, conversations: [conversation, ...others].sort((a, b) => b.lastMessageAt - a.lastMessageAt) };
  });
  refreshCounts(qc);
}

function patchEverywhere(qc: QueryClient, id: string, patch: (c: AgentConversation) => AgentConversation): void {
  qc.setQueryData<AgentConversation>(queryKeys.conversation(id), (c) => (c ? patch(c) : c));
  for (const [key, data] of qc.getQueriesData<ConversationPages>({ queryKey: queryKeys.conversationLists })) {
    if (data) qc.setQueryData(key, patchConversation(data, id, patch));
  }
}

function applyContactPresence(qc: QueryClient, contactId: string, online: boolean): void {
  for (const [key, data] of qc.getQueriesData<ConversationPages>({ queryKey: queryKeys.conversationLists })) {
    if (data) qc.setQueryData(key, patchContact(data, contactId, { online }));
  }
  for (const [key, c] of qc.getQueriesData<AgentConversation>({ queryKey: ["conversation"] })) {
    if (c && c.contact.id === contactId) qc.setQueryData(key, { ...c, contact: { ...c.contact, online } });
  }
  qc.setQueryData<ContactDetail>(queryKeys.contact(contactId), (d) => (d ? { ...d, contact: { ...d.contact, online } } : d));
  for (const [key, data] of qc.getQueriesData<ContactPages>({ queryKey: ["contacts"] })) {
    if (!data) continue;
    const pages = data.pages.map((p) => ({ ...p, items: p.items.map((c) => (c.id === contactId ? { ...c, online } : c)) }));
    qc.setQueryData(key, { ...data, pages });
  }
}

function applyContactDeleted(qc: QueryClient, contactId: string): void {
  for (const [key, data] of qc.getQueriesData<ConversationPages>({ queryKey: queryKeys.conversationLists })) {
    if (data) qc.setQueryData(key, removeContact(data, contactId));
  }
  qc.removeQueries({
    predicate: (query) =>
      query.queryKey[0] === "conversation" && (query.state.data as AgentConversation | undefined)?.contact.id === contactId,
  });
  qc.removeQueries({ queryKey: queryKeys.contact(contactId) });
  for (const [key, data] of qc.getQueriesData<ContactPages>({ queryKey: ["contacts"] })) {
    if (!data) continue;
    qc.setQueryData(key, { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.filter((c) => c.id !== contactId) })) });
  }
  refreshCounts(qc);
}

export function applyEvent(qc: QueryClient, event: AgentServerEvent, meId: string): void {
  switch (event.type) {
    case "ready":
    case "presence": {
      presenceStore.set(event.onlineAgentIds);
      const known = new Set(qc.getQueryData<Bootstrap>(queryKeys.bootstrap)?.teammates.map((t) => t.id));
      if (event.onlineAgentIds.some((id) => !known.has(id))) void qc.invalidateQueries({ queryKey: queryKeys.bootstrap });
      return;
    }
    case "message.created": {
      const key = queryKeys.messages(event.message.conversationId);
      const messages = qc.getQueryData<MessagePages>(key);
      if (messages) qc.setQueryData(key, upsertMessage(messages, event.message));
      if (event.message.authorType === "contact") {
        typingStore.set((s) => applyTyping(s, { conversationId: event.message.conversationId, by: "contact", isTyping: false }, Date.now()));
      }
      applyConversation(qc, event.conversation, meId);
      return;
    }
    case "conversation.updated":
      applyConversation(qc, event.conversation, meId);
      return;
    case "conversation.read":
      patchEverywhere(qc, event.conversationId, (c) =>
        event.by === "contact" ? { ...c, contactLastReadAt: event.at } : { ...c, agentLastReadAt: event.at, unread: false },
      );
      return;
    case "typing":
      typingStore.set((s) => applyTyping(s, event, Date.now()));
      return;
    case "contact.presence":
      applyContactPresence(qc, event.contactId, event.online);
      return;
    case "contact.deleted":
      applyContactDeleted(qc, event.contactId);
      return;
    case "agent.availability":
      qc.setQueryData<Bootstrap>(queryKeys.bootstrap, (b) =>
        b
          ? {
              ...b,
              agent: b.agent.id === event.agentId ? { ...b.agent, availability: event.availability } : b.agent,
              teammates: b.teammates.map((t) => (t.id === event.agentId ? { ...t, availability: event.availability } : t)),
            }
          : b,
      );
      void qc.invalidateQueries({ queryKey: queryKeys.teams });
      return;
  }
}

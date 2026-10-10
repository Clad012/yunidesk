import type { InfiniteData } from "@tanstack/react-query";
import { mergeMessages, type AgentConversation, type Contact, type Page, type TimelineMessage } from "yunidesk";
import type { InboxView } from "./endpoints";

// Pure functions that fold realtime events and optimistic writes into the TanStack Query cache.

export type ConversationPages = InfiniteData<Page<AgentConversation>, string | null>;
export type MessagePages = InfiniteData<Page<TimelineMessage>, string | null>;

export function matchesView(conversation: AgentConversation, view: InboxView, meId: string): boolean {
  switch (view) {
    case "mine":
      return conversation.status === "open" && conversation.assignee?.id === meId;
    case "unassigned":
      return conversation.status === "open" && !conversation.assignee;
    case "open":
    case "snoozed":
    case "resolved":
      return conversation.status === view;
    case "all":
      return true;
  }
}

/** Same order as the server: newest message first, then id descending. */
function comesBefore(a: AgentConversation, b: AgentConversation): boolean {
  return a.lastMessageAt > b.lastMessageAt || (a.lastMessageAt === b.lastMessageAt && a.id > b.id);
}

/**
 * Puts the conversation at its sorted place (or removes it when it no longer belongs to the list).
 * A conversation older than everything loaded is left out when more pages exist: pagination brings it.
 */
export function upsertConversation(data: ConversationPages, conversation: AgentConversation, belongs: boolean): ConversationPages {
  const pages = data.pages.map((page) => ({ ...page, items: page.items.filter((c) => c.id !== conversation.id) }));
  if (belongs) {
    let placed = false;
    for (const page of pages) {
      const index = page.items.findIndex((c) => comesBefore(conversation, c));
      if (index !== -1) {
        page.items.splice(index, 0, conversation);
        placed = true;
        break;
      }
    }
    const last = pages[pages.length - 1];
    if (!placed && last && !last.nextCursor) last.items.push(conversation);
  }
  return { ...data, pages };
}

/** Updates a conversation in place, without moving it or adding it. */
export function patchConversation(
  data: ConversationPages,
  id: string,
  patch: (conversation: AgentConversation) => AgentConversation,
): ConversationPages {
  let changed = false;
  const pages = data.pages.map((page) => ({
    ...page,
    items: page.items.map((c) => {
      if (c.id !== id) return c;
      changed = true;
      return patch(c);
    }),
  }));
  return changed ? { ...data, pages } : data;
}

export function patchContact(data: ConversationPages, contactId: string, patch: Partial<Contact>): ConversationPages {
  let changed = false;
  const pages = data.pages.map((page) => ({
    ...page,
    items: page.items.map((c) => {
      if (c.contact.id !== contactId) return c;
      changed = true;
      return { ...c, contact: { ...c.contact, ...patch } };
    }),
  }));
  return changed ? { ...data, pages } : data;
}

export function removeContact(data: ConversationPages, contactId: string): ConversationPages {
  return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((c) => c.contact.id !== contactId) })) };
}

const sameMessage = (a: TimelineMessage, b: TimelineMessage) =>
  a.id === b.id || (a.clientId !== null && a.clientId === b.clientId);

/** Adds or replaces a message; a server copy replaces the optimistic one with the same clientId. */
export function upsertMessage(data: MessagePages, message: TimelineMessage): MessagePages {
  const pageIndex = data.pages.findIndex((page) => page.items.some((m) => sameMessage(m, message)));
  const target = pageIndex === -1 ? 0 : pageIndex;
  const pages = data.pages.map((page, index) =>
    index === target ? { ...page, items: mergeMessages(page.items, [message]) } : page,
  );
  if (pages.length === 0) pages.push({ items: [message], nextCursor: null });
  return { ...data, pages };
}

export function removeMessage(data: MessagePages, clientId: string): MessagePages {
  return { ...data, pages: data.pages.map((page) => ({ ...page, items: page.items.filter((m) => m.clientId !== clientId) })) };
}

/** Pages are newest first; the timeline is oldest first and deduplicated. */
export function flattenMessages(data: MessagePages | undefined): TimelineMessage[] {
  if (!data) return [];
  return mergeMessages([], [...data.pages].reverse().flatMap((page) => page.items));
}

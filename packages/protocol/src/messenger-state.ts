import { TYPING_TTL_MS } from "./limits";
import type { ContactConversation, ContactServerEvent, Message, PublicAgent, SendMessageInput } from "./types";

// Pure state for a contact's messenger, shared by the web widget and the React Native SDK.
// Feed it REST results and websocket events; render from it.

export type DeliveryState = "sending" | "failed";

/** A message as shown: a server message, or an optimistic one we are still sending. */
export interface TimelineMessage extends Message {
  delivery?: DeliveryState;
  /** Kept on optimistic messages so a failed send can be retried as is. */
  draft?: SendMessageInput;
}

export interface Thread {
  messages: TimelineMessage[];
  /** Cursor for the next older page, or null when everything is loaded. */
  olderCursor: string | null;
  loaded: boolean;
}

export interface TypingState {
  agent: PublicAgent;
  until: number;
}

/** The assistant's reply while it is being written, per conversation. */
export interface AssistantDraft {
  streamId: string;
  text: string;
  /** "done": finished; it stays on screen until the final message replaces it, so nothing blinks. */
  status: "thinking" | "writing" | "done";
}

export interface MessengerState {
  conversations: ContactConversation[];
  threads: Record<string, Thread>;
  typing: Record<string, TypingState>;
  teamOnline: boolean;
  assistantDrafts: Record<string, AssistantDraft>;
}

export type MessengerAction =
  | { type: "conversations"; conversations: ContactConversation[] }
  | { type: "conversation"; conversation: ContactConversation }
  | { type: "page"; conversationId: string; messages: Message[]; olderCursor: string | null; older: boolean }
  | { type: "optimistic"; conversationId: string; message: TimelineMessage }
  | { type: "sent"; conversationId: string; clientId: string; message: Message; conversation: ContactConversation }
  | { type: "failed"; conversationId: string; clientId: string }
  /** A new conversation was created: move the optimistic thread from its temporary id. */
  | { type: "rekey"; fromId: string; toId: string }
  | { type: "event"; event: ContactServerEvent; now?: number }
  | { type: "expireTyping"; now: number };

export const initialMessengerState: MessengerState = {
  conversations: [],
  threads: {},
  typing: {},
  teamOnline: false,
  assistantDrafts: {},
};

const EMPTY_THREAD: Thread = { messages: [], olderCursor: null, loaded: false };

export function messengerReducer(state: MessengerState, action: MessengerAction): MessengerState {
  switch (action.type) {
    case "conversations":
      return { ...state, conversations: sortConversations(action.conversations) };
    case "conversation":
      return { ...state, conversations: upsertConversation(state.conversations, action.conversation) };
    case "page": {
      const thread = state.threads[action.conversationId] ?? EMPTY_THREAD;
      // A finished reply whose message we missed (socket dropped) is in this page: drop its draft.
      const drafts = state.assistantDrafts ?? {};
      if (drafts[action.conversationId]?.status === "done") {
        const { [action.conversationId]: _, ...rest } = drafts;
        state = { ...state, assistantDrafts: rest };
      }
      return withThread(state, action.conversationId, {
        messages: mergeMessages(thread.messages, action.messages),
        // An older page moves the cursor back; a refresh of the newest page keeps any older cursor we had.
        olderCursor: action.older || !thread.loaded ? action.olderCursor : thread.olderCursor,
        loaded: true,
      });
    }
    case "optimistic": {
      const thread = state.threads[action.conversationId] ?? { ...EMPTY_THREAD, loaded: true };
      return withThread(state, action.conversationId, {
        ...thread,
        messages: mergeMessages(thread.messages, [action.message]),
      });
    }
    case "sent": {
      const thread = state.threads[action.conversationId] ?? { ...EMPTY_THREAD, loaded: true };
      const next = withThread(state, action.conversationId, {
        ...thread,
        messages: mergeMessages(thread.messages, [action.message]),
      });
      return { ...next, conversations: upsertConversation(next.conversations, action.conversation) };
    }
    case "failed": {
      const thread = state.threads[action.conversationId];
      if (!thread) return state;
      return withThread(state, action.conversationId, {
        ...thread,
        messages: thread.messages.map((m) => (m.clientId === action.clientId && m.delivery ? { ...m, delivery: "failed" } : m)),
      });
    }
    case "rekey": {
      const thread = state.threads[action.fromId];
      if (!thread) return state;
      const { [action.fromId]: _, ...rest } = state.threads;
      const existing = rest[action.toId];
      const merged: Thread = existing
        ? { ...existing, messages: mergeMessages(existing.messages, thread.messages) }
        : { ...thread, messages: thread.messages.map((m) => ({ ...m, conversationId: action.toId })) };
      return { ...state, threads: { ...rest, [action.toId]: merged } };
    }
    case "event":
      return applyEvent(state, action.event, action.now ?? Date.now());
    case "expireTyping": {
      const typing = Object.fromEntries(Object.entries(state.typing).filter(([, t]) => t.until > action.now));
      return Object.keys(typing).length === Object.keys(state.typing).length ? state : { ...state, typing };
    }
    default:
      return state;
  }
}

function applyEvent(state: MessengerState, event: ContactServerEvent, now: number): MessengerState {
  switch (event.type) {
    case "ready":
      return state;
    case "presence":
      return { ...state, teamOnline: event.online };
    case "message.created": {
      const conversations = upsertConversation(state.conversations, event.conversation);
      const thread = state.threads[event.message.conversationId];
      // A reply clears that teammate's typing bubble.
      const { [event.message.conversationId]: _, ...typing } = state.typing;
      // The assistant's final message replaces its live draft.
      const { [event.message.conversationId]: __, ...assistantDrafts } = state.assistantDrafts ?? {};
      const next = {
        ...state,
        conversations,
        typing: event.message.authorType === "agent" ? typing : state.typing,
        assistantDrafts: event.message.ai ? assistantDrafts : (state.assistantDrafts ?? {}),
      };
      // Threads we never opened are fetched on open; don't create a partial one.
      if (!thread) return next;
      return withThread(next, event.message.conversationId, {
        ...thread,
        messages: mergeMessages(thread.messages, [event.message]),
      });
    }
    case "conversation.updated":
      return { ...state, conversations: upsertConversation(state.conversations, event.conversation) };
    case "assistant.status": {
      const drafts = state.assistantDrafts ?? {};
      if (event.status === "thinking") {
        return { ...state, assistantDrafts: { ...drafts, [event.conversationId]: { streamId: event.streamId, text: "", status: "thinking" } } };
      }
      const current = drafts[event.conversationId];
      if (!current || current.streamId !== event.streamId) return state;
      // Done: keep the text until the final message replaces it; dropping it now would leave a gap.
      if (event.status === "done") {
        return { ...state, assistantDrafts: { ...drafts, [event.conversationId]: { ...current, status: "done" } } };
      }
      // Failed: nothing follows.
      const { [event.conversationId]: _, ...rest } = drafts;
      return { ...state, assistantDrafts: rest };
    }
    case "assistant.delta": {
      const drafts = state.assistantDrafts ?? {};
      const current = drafts[event.conversationId];
      // Frames can arrive late: never go back to a shorter text of the same reply.
      if (current && current.streamId === event.streamId && current.text.length > event.text.length) return state;
      return {
        ...state,
        assistantDrafts: { ...drafts, [event.conversationId]: { streamId: event.streamId, text: event.text, status: "writing" } },
      };
    }
    case "conversation.read":
      return {
        ...state,
        conversations: state.conversations.map((c) =>
          c.id === event.conversationId ? { ...c, agentLastReadAt: Math.max(c.agentLastReadAt ?? 0, event.at) } : c,
        ),
      };
    case "typing": {
      if (!event.isTyping) {
        const { [event.conversationId]: _, ...typing } = state.typing;
        return { ...state, typing };
      }
      return {
        ...state,
        typing: { ...state.typing, [event.conversationId]: { agent: event.agent, until: now + TYPING_TTL_MS } },
      };
    }
    default:
      // Unknown frames (e.g. the server's "pong", or events from a newer server) leave state as is.
      return state;
  }
}

function withThread(state: MessengerState, id: string, thread: Thread): MessengerState {
  return { ...state, threads: { ...state.threads, [id]: thread } };
}

export function sortConversations(list: ContactConversation[]): ContactConversation[] {
  return [...list].sort((a, b) => b.lastMessageAt - a.lastMessageAt);
}

export function upsertConversation(list: ContactConversation[], conversation: ContactConversation): ContactConversation[] {
  const index = list.findIndex((c) => c.id === conversation.id);
  if (index === -1) return sortConversations([conversation, ...list]);
  // Ignore stale snapshots that arrive out of order.
  if (list[index]!.updatedAt > conversation.updatedAt) return list;
  const next = [...list];
  next[index] = conversation;
  return sortConversations(next);
}

/**
 * Merges messages by id; a server message replaces the optimistic one with the same clientId.
 * Result is sorted oldest first.
 */
export function mergeMessages(existing: TimelineMessage[], incoming: TimelineMessage[]): TimelineMessage[] {
  const byKey = new Map<string, TimelineMessage>();
  const keyOf = (m: TimelineMessage) => (m.clientId ? `c:${m.clientId}` : `i:${m.id}`);
  for (const message of existing) byKey.set(keyOf(message), message);
  for (const message of incoming) {
    const key = keyOf(message);
    const current = byKey.get(key);
    // Never downgrade a confirmed message back to an optimistic one.
    if (current && !current.delivery && message.delivery) continue;
    byKey.set(key, message);
  }
  return [...byKey.values()].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
}

export function totalUnread(state: Pick<MessengerState, "conversations">): number {
  return state.conversations.reduce((sum, c) => sum + c.unreadCount, 0);
}

// ---- Timeline layout ----

export type TimelineItem =
  | { type: "day"; key: string; at: number }
  | { type: "event"; key: string; message: TimelineMessage }
  | {
      type: "group";
      key: string;
      side: "contact" | "team";
      agent: PublicAgent | null;
      messages: TimelineMessage[];
    };

const GROUP_GAP_MS = 5 * 60 * 1000;

/** Day separators, then runs of messages from the same author within five minutes. */
export function buildTimeline(messages: TimelineMessage[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  let lastDay = "";
  let group: Extract<TimelineItem, { type: "group" }> | null = null;

  for (const message of messages) {
    const day = new Date(message.createdAt).toDateString();
    if (day !== lastDay) {
      items.push({ type: "day", key: `day:${day}`, at: message.createdAt });
      lastDay = day;
      group = null;
    }
    if (message.kind === "event") {
      items.push({ type: "event", key: message.id, message });
      group = null;
      continue;
    }
    const side = message.authorType === "contact" ? "contact" : "team";
    const last = group?.messages[group.messages.length - 1];
    // AI replies and a person's never share a group: each group is labelled by its first message.
    const sameAuthor =
      group &&
      group.side === side &&
      (side === "contact" || (group.agent?.id === message.agent?.id && Boolean(group.messages[0]?.ai) === Boolean(message.ai)));
    if (group && sameAuthor && last && message.createdAt - last.createdAt < GROUP_GAP_MS) {
      group.messages.push(message);
    } else {
      group = { type: "group", key: `g:${message.clientId ?? message.id}`, side, agent: message.agent, messages: [message] };
      items.push(group);
    }
  }
  return items;
}

/** The contact's last message the team has read, for the "Seen" label. */
export function lastSeenMessageId(messages: TimelineMessage[], agentLastReadAt: number | null): string | null {
  if (!agentLastReadAt) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.authorType === "contact" && !m.delivery && m.createdAt <= agentLastReadAt) return m.id;
    if (m.authorType !== "contact" && m.kind === "text") return null; // the team replied after; no need for "Seen"
  }
  return null;
}

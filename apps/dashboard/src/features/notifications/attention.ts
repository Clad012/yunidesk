import { Store } from "@/lib/realtime/store";

/** The conversation open on screen, so we don't ping for messages the agent is already reading. */
export const activeConversationStore = new Store<string | null>(null);

/** Conversations with contact messages that arrived while the agent wasn't looking. Drives the tab title. */
export const unseenStore = new Store<ReadonlySet<string>>(new Set());

export function markUnseen(id: string): void {
  unseenStore.set((current) => (current.has(id) ? current : new Set([...current, id])));
}

export function markSeen(id: string): void {
  unseenStore.set((current) => {
    if (!current.has(id)) return current;
    const next = new Set(current);
    next.delete(id);
    return next;
  });
}

/** Should a new contact message ping the agent? Only when it isn't the conversation they're looking at. */
export function needsAttention(conversationId: string, activeId: string | null, hidden: boolean): boolean {
  return hidden || activeId !== conversationId;
}

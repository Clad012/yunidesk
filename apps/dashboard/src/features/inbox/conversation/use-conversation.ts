import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { AgentConversation, Page, TimelineMessage } from "yunidesk";
import { endpoints, queryKeys } from "@/lib/endpoints";
import { flattenMessages, type ConversationPages, type MessagePages } from "@/lib/inbox-cache";

/** Seeds the detail from any list that already has it, so opening a row is instant. */
function fromLists(qc: ReturnType<typeof useQueryClient>, id: string): AgentConversation | undefined {
  for (const [, data] of qc.getQueriesData<ConversationPages>({ queryKey: queryKeys.conversationLists })) {
    const found = data?.pages.flatMap((p) => p.items).find((c) => c.id === id);
    if (found) return found;
  }
  return undefined;
}

export function useConversation(id: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: queryKeys.conversation(id),
    queryFn: () => endpoints.conversation(id),
    initialData: () => fromLists(qc, id),
    initialDataUpdatedAt: 0,
  });
}

export function useMessages(id: string) {
  const query = useInfiniteQuery<Page<TimelineMessage>, Error, MessagePages, readonly string[], string | null>({
    queryKey: queryKeys.messages(id),
    queryFn: ({ pageParam }) => endpoints.messages(id, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 10_000,
  });
  const messages = useMemo<TimelineMessage[]>(() => flattenMessages(query.data), [query.data]);
  return { ...query, messages };
}

/** Marks the conversation read while it is open, visible and unread. */
export function useMarkRead(conversation: AgentConversation | undefined): void {
  const qc = useQueryClient();
  const id = conversation?.id;
  const unread = conversation?.unread ?? false;
  useEffect(() => {
    if (!id || !unread) return;
    const mark = () => {
      if (document.hidden) return;
      const patch = (c: AgentConversation | undefined) => (c ? { ...c, unread: false } : c);
      qc.setQueryData<AgentConversation>(queryKeys.conversation(id), patch);
      for (const [key, data] of qc.getQueriesData<ConversationPages>({ queryKey: queryKeys.conversationLists })) {
        if (!data) continue;
        qc.setQueryData<ConversationPages>(key, {
          ...data,
          pages: data.pages.map((p) => ({ ...p, items: p.items.map((c) => (c.id === id ? { ...c, unread: false } : c)) })),
        });
      }
      void endpoints.markRead(id).catch(() => undefined);
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [id, unread, qc]);
}

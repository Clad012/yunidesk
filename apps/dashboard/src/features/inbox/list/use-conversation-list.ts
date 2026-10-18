import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import type { AgentConversation } from "yunidesk";
import { endpoints, queryKeys, type InboxView, type ListFilters } from "@/lib/endpoints";

export function conversationListQuery(view: InboxView, q: string, filters: ListFilters = {}) {
  return {
    queryKey: queryKeys.conversationList(view, q, undefined, filters),
    queryFn: ({ pageParam }: { pageParam: string | null }) => endpoints.conversations({ view, q, cursor: pageParam, ...filters }),
    initialPageParam: null as string | null,
    getNextPageParam: (last: { nextCursor: string | null }) => last.nextCursor,
  };
}

export function useConversationList(view: InboxView, q: string, filters: ListFilters = {}) {
  const query = useInfiniteQuery(conversationListQuery(view, q, filters));
  const items = useMemo<AgentConversation[]>(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  return { ...query, items };
}

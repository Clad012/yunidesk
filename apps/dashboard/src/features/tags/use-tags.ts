import { useQuery } from "@tanstack/react-query";
import { endpoints, queryKeys } from "@/lib/endpoints";

/** Every tag with its usage; refreshed when conversations change (see apply-event). */
export function useTags() {
  return useQuery({ queryKey: queryKeys.tags, queryFn: endpoints.tags, staleTime: 30_000 });
}

export function useConversationFields() {
  return useQuery({ queryKey: queryKeys.conversationFields, queryFn: endpoints.conversationFields, staleTime: 60_000 });
}

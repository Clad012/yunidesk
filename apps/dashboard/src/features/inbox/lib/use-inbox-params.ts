import { useParams, useSearch } from "@tanstack/react-router";
import type { InboxView } from "@/lib/endpoints";

/** The current view, search and open conversation, from the URL. */
export function useInboxParams(): { view: InboxView; q: string; conversationId: string | null } {
  const params = useParams({ strict: false }) as { view?: InboxView; conversationId?: string };
  const search = useSearch({ strict: false }) as { q?: string };
  return { view: params.view ?? "mine", q: search.q ?? "", conversationId: params.conversationId ?? null };
}

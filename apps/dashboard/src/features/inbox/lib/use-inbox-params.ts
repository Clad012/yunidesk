import { useParams, useSearch } from "@tanstack/react-router";
import type { InboxView, ListFilters } from "@/lib/endpoints";
import type { InboxSearch } from "@/router";

export interface InboxParams {
  view: InboxView;
  q: string;
  conversationId: string | null;
  filters: ListFilters;
  /** Search params to carry along when moving between views and conversations. */
  search: InboxSearch;
}

/** The current view, search, filters and open conversation, from the URL. */
export function useInboxParams(): InboxParams {
  const params = useParams({ strict: false }) as { view?: InboxView; conversationId?: string };
  const search = useSearch({ strict: false }) as InboxSearch;
  const filters: ListFilters = {};
  if (search.tag) filters.tag = search.tag;
  if (search.team) filters.team = search.team;
  if (search.priority) filters.priority = search.priority;
  if (search.sort) filters.sort = search.sort;
  const carried: InboxSearch = { ...filters, ...(search.q ? { q: search.q } : {}) };
  return { view: params.view ?? "mine", q: search.q ?? "", conversationId: params.conversationId ?? null, filters, search: carried };
}

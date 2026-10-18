import { useNavigate } from "@tanstack/react-router";
import type { ListFilters } from "@/lib/endpoints";
import { useInboxParams } from "./use-inbox-params";

/** Changes the list filters in the URL, keeping the view, the search and the open conversation. */
export function useSetFilters(): (patch: Partial<Record<keyof ListFilters, ListFilters[keyof ListFilters] | null>>) => void {
  const { view, q, conversationId, filters } = useInboxParams();
  const navigate = useNavigate();
  return (patch) => {
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries({ ...filters, ...patch })) if (value) next[key] = value;
    const search = { ...next, ...(q ? { q } : {}) };
    if (conversationId) void navigate({ to: "/inbox/$view/$conversationId", params: { view, conversationId }, search, replace: true });
    else void navigate({ to: "/inbox/$view", params: { view }, search, replace: true });
  };
}

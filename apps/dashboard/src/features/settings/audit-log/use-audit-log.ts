import { useInfiniteQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { endpoints, queryKeys } from "@/lib/endpoints";

export interface AuditFilters {
  /** An action or a group of actions; "" for all. */
  action: string;
  /** An agent or API key id; "" for everyone. */
  actor: string;
}

export function useAuditLog(filters: AuditFilters, enabled: boolean) {
  const query = useInfiniteQuery({
    queryKey: queryKeys.auditLog(filters.action, filters.actor),
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      endpoints.auditLog({ action: filters.action || undefined, actor: filters.actor || undefined, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  return { query, items };
}

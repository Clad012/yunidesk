import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ReportQuery } from "yunidesk";
import { endpoints, queryKeys } from "@/lib/endpoints";

const OPTIONS = { placeholderData: keepPreviousData, staleTime: 60_000, retry: 1 } as const;

// A placeholder query that never runs while the period is invalid.
const NONE: ReportQuery = { from: "", to: "" };

/** The four report queries, all scoped by the same period and filters. Refetching keeps the last render. */
export function useReports(query: ReportQuery | null) {
  const q = query ?? NONE;
  const enabled = query !== null;
  return {
    summary: useQuery({ queryKey: queryKeys.report("summary", q), queryFn: () => endpoints.reportSummary(q), enabled, ...OPTIONS }),
    volume: useQuery({ queryKey: queryKeys.report("volume", q), queryFn: () => endpoints.reportVolume(q), enabled, ...OPTIONS }),
    teammates: useQuery({ queryKey: queryKeys.report("teammates", q), queryFn: () => endpoints.reportTeammates(q), enabled, ...OPTIONS }),
    tags: useQuery({ queryKey: queryKeys.report("tags", q), queryFn: () => endpoints.reportTags(q), enabled, ...OPTIONS }),
  };
}

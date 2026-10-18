import { useNavigate, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import type { ReportQuery } from "yunidesk";
import { browserTimeZone, isValidRange, presetRange, todayIn, type RangePreset } from "./lib/range";
import type { ReportSearch } from "./lib/report-search";

export interface ReportParams {
  search: ReportSearch;
  preset: RangePreset;
  /** What the server is asked; null while a custom range is incomplete or invalid. */
  query: ReportQuery | null;
  setSearch: (patch: Partial<Record<keyof ReportSearch, string | null>>) => void;
}

export function useReportParams(): ReportParams {
  const search = useSearch({ strict: false }) as ReportSearch;
  const navigate = useNavigate();
  const preset = search.range ?? "7d";
  const query = useMemo<ReportQuery | null>(() => {
    const tz = browserTimeZone();
    let range: { from: string; to: string };
    if (preset === "custom") {
      if (!search.from || !search.to || !isValidRange(search.from, search.to)) return null;
      range = { from: search.from, to: search.to };
    } else {
      range = presetRange(preset, todayIn(tz));
    }
    return {
      ...range,
      tz,
      ...(search.channel ? { channel: search.channel } : {}),
      ...(search.tag ? { tagId: search.tag } : {}),
      ...(search.assignee ? { assigneeId: search.assignee } : {}),
      ...(search.team ? { teamId: search.team } : {}),
    };
  }, [preset, search.from, search.to, search.channel, search.tag, search.assignee, search.team]);

  const setSearch: ReportParams["setSearch"] = (patch) => {
    const next: Record<string, string> = {};
    for (const [key, value] of Object.entries({ ...search, ...patch })) if (value) next[key] = value;
    void navigate({ to: "/reports", search: next, replace: true });
  };
  return { search, preset, query, setSearch };
}

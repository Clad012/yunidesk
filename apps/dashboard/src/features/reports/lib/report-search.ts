import { CHANNELS, type Channel } from "yunidesk";
import { RANGE_PRESETS, type RangePreset } from "./range";

/** The report's period and filters, kept in the URL so a view can be shared. */
export interface ReportSearch {
  range?: RangePreset;
  /** Custom range only, YYYY-MM-DD. */
  from?: string;
  to?: string;
  channel?: Channel;
  tag?: string;
  /** A teammate id, or "none" for unassigned. */
  assignee?: string;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseReportSearch(search: Record<string, unknown>): ReportSearch {
  const out: ReportSearch = {};
  const range = search.range;
  if (typeof range === "string" && ([...RANGE_PRESETS, "custom"] as string[]).includes(range)) out.range = range as RangePreset;
  if (typeof search.from === "string" && DATE.test(search.from)) out.from = search.from;
  if (typeof search.to === "string" && DATE.test(search.to)) out.to = search.to;
  if (typeof search.channel === "string" && (CHANNELS as string[]).includes(search.channel)) out.channel = search.channel as Channel;
  if (typeof search.tag === "string" && /^tag_[0-9a-z]{26}$/.test(search.tag)) out.tag = search.tag;
  if (typeof search.assignee === "string" && /^(none|agt_[0-9a-z]{1,40})$/.test(search.assignee)) out.assignee = search.assignee;
  return out;
}

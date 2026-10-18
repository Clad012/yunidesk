import type { ReportSummary } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { formatCount, formatDuration, formatPercent } from "./lib/format";
import { daysBetween } from "./lib/range";
import { MetricTile, type MetricTileProps } from "./metric-tile";

/** The headline numbers, each against the same number of days just before. */
export function MetricTiles({ summary }: { summary: ReportSummary }) {
  const { current: now, previous: before, snapshot } = summary;
  const days = daysBetween(now.from, now.to);
  const vs = days === 1 ? copy.reports.vsPreviousDay : fmt(copy.reports.vsPrevious, { days });
  const compare = (
    current: number | null,
    previous: number | null,
    kind: "count" | "duration" | "rate",
    upIsGood: boolean | null,
  ): MetricTileProps["comparison"] => ({ current, previous, kind, upIsGood, label: vs, emptyLabel: copy.reports.noPrevious });
  const sat = now.satisfaction;
  const ai = now.assistant;

  const tiles: MetricTileProps[] = [
    { label: copy.reports.created, value: formatCount(now.created), hint: copy.reports.createdHint, comparison: compare(now.created, before.created, "count", null) },
    { label: copy.reports.resolved, value: formatCount(now.resolved), hint: copy.reports.resolvedHint, comparison: compare(now.resolved, before.resolved, "count", true) },
    {
      label: copy.reports.firstResponse,
      value: formatDuration(now.firstResponse.median),
      detail: now.firstResponse.count ? `${fmt(copy.reports.p90, { value: formatDuration(now.firstResponse.p90) })} · ${fmt(copy.reports.basedOn, { n: now.firstResponse.count })}` : undefined,
      hint: copy.reports.firstResponseHint,
      comparison: compare(now.firstResponse.median, before.firstResponse.median, "duration", false),
    },
    {
      label: copy.reports.resolution,
      value: formatDuration(now.resolution.median),
      detail: now.resolution.count ? `${fmt(copy.reports.p90, { value: formatDuration(now.resolution.p90) })} · ${fmt(copy.reports.basedOn, { n: now.resolution.count })}` : undefined,
      hint: copy.reports.resolutionHint,
      comparison: compare(now.resolution.median, before.resolution.median, "duration", false),
    },
    {
      label: copy.reports.csat,
      value: formatPercent(sat.csat),
      detail: sat.rated
        ? fmt(copy.reports.csatSplit, { rated: sat.rated, great: formatPercent(sat.great / sat.rated), okay: formatPercent(sat.okay / sat.rated), bad: formatPercent(sat.bad / sat.rated) })
        : undefined,
      hint: copy.reports.csatHint,
      comparison: compare(sat.csat, before.satisfaction.csat, "rate", true),
    },
    {
      label: copy.reports.aiRate,
      value: formatPercent(ai.resolutionRate),
      detail: ai.involved ? fmt(copy.reports.aiSplit, { resolved: ai.resolved, involved: ai.involved, handedOff: ai.handedOff }) : undefined,
      hint: copy.reports.aiRateHint,
      comparison: compare(ai.resolutionRate, before.assistant.resolutionRate, "rate", true),
    },
    { label: copy.reports.reopened, value: formatCount(now.reopened), hint: copy.reports.reopenedHint, comparison: compare(now.reopened, before.reopened, "count", false) },
    { label: copy.reports.openNow, value: formatCount(snapshot.open), detail: fmt(copy.reports.snoozedNow, { n: snapshot.snoozed }), hint: copy.reports.openNowHint },
  ];

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={copy.reports.title}>
      {tiles.map((tile) => (
        <MetricTile key={tile.label} {...tile} />
      ))}
    </section>
  );
}

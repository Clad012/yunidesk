import { copy } from "@/lib/copy";
import { endpoints } from "@/lib/endpoints";
import { useCan } from "@/hooks/use-bootstrap";
import { BusiestHours } from "./charts/busiest-hours";
import { VolumeChart } from "./charts/volume-chart";
import { MetricTiles } from "./metric-tiles";
import { ReportCard } from "./report-card";
import { ReportFilters } from "./report-filters";
import { ReportEmpty, ReportError, ReportSkeleton } from "./report-states";
import { TagsTable } from "./tables/tags-table";
import { TeammatesTable } from "./tables/teammates-table";
import { useReportParams } from "./use-report-params";
import { useReports } from "./use-reports";

export function ReportsPage() {
  const allowed = useCan("reports.view");
  const params = useReportParams();
  const { summary, volume, teammates, tags } = useReports(allowed ? params.query : null);
  const failed = [summary, volume, teammates, tags].find((q) => q.isError && !q.data);
  const retry = () => [summary, volume, teammates, tags].forEach((q) => void q.refetch());
  const quiet = summary.data && summary.data.current.created === 0 && summary.data.current.resolved === 0;

  return (
    <div className="m-2 flex h-[calc(100%-1rem)] flex-col overflow-hidden rounded-xl border bg-background shadow-xs">
      <header className="flex flex-col gap-3 border-b bg-card px-4 py-4 sm:px-6">
        <h1 className="text-lg font-semibold tracking-tight">{copy.reports.title}</h1>
        <ReportFilters params={params} />
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
          {!allowed ? (
            <ReportError error="forbidden" onRetry={() => undefined} />
          ) : !params.query ? null : failed ? (
            <ReportError error={failed.error} onRetry={retry} />
          ) : !summary.data ? (
            <ReportSkeleton />
          ) : (
            <>
              <div className={summary.isPlaceholderData ? "opacity-60 transition-opacity" : "transition-opacity"}>
                <MetricTiles summary={summary.data} />
              </div>
              {quiet ? <ReportEmpty /> : null}
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <ReportCard title={copy.reports.volume} hint={copy.reports.volumeHint} refreshing={volume.isPlaceholderData}>
                  {volume.data ? <VolumeChart days={volume.data.days} /> : <div className="h-60" />}
                </ReportCard>
                <ReportCard title={copy.reports.busiestHours} hint={copy.reports.busiestHoursHint} refreshing={volume.isPlaceholderData}>
                  {volume.data ? <BusiestHours grid={volume.data.busiestHours} /> : <div className="h-60" />}
                </ReportCard>
              </div>
              <ReportCard
                title={copy.reports.teammates}
                hint={copy.reports.teammatesHint}
                csvUrl={endpoints.reportCsvUrl("teammates", params.query)}
                refreshing={teammates.isPlaceholderData}
              >
                {teammates.data ? <TeammatesTable rows={teammates.data.items} /> : <div className="h-24" />}
              </ReportCard>
              <ReportCard title={copy.reports.tags} hint={copy.reports.tagsHint} csvUrl={endpoints.reportCsvUrl("tags", params.query)} refreshing={tags.isPlaceholderData}>
                {tags.data ? <TagsTable rows={tags.data.items} /> : <div className="h-24" />}
              </ReportCard>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

import type { ReportTeammateRow } from "yunidesk";
import { copy } from "@/lib/copy";
import { PersonAvatar } from "@/components/person-avatar";
import { formatDuration, formatPercent } from "../lib/format";

const th = "px-3 py-2 font-medium";
const td = "px-3 py-2 text-right tabular-nums";

/** Per teammate: assigned, replied, resolved, median first response and satisfaction. */
export function TeammatesTable({ rows }: { rows: ReportTeammateRow[] }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{copy.reports.noTeammates}</p>;
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[36rem] text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="bg-muted/60">
            <th scope="col" className={`${th} rounded-l-lg text-left`}>{copy.reports.teammate}</th>
            <th scope="col" className={`${th} text-right`}>{copy.reports.assigned}</th>
            <th scope="col" className={`${th} text-right`}>{copy.reports.replied}</th>
            <th scope="col" className={`${th} text-right`}>{copy.reports.resolved}</th>
            <th scope="col" className={`${th} text-right`}>{copy.reports.medianFirstResponse}</th>
            <th scope="col" className={`${th} rounded-r-lg text-right`}>{copy.reports.csat}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.agent.id}>
              <th scope="row" className="px-3 py-2 text-left font-normal">
                <span className="flex items-center gap-2.5">
                  <PersonAvatar name={row.agent.name} avatarUrl={row.agent.avatarUrl} seed={row.agent.id} className="size-6" />
                  <span className="truncate font-medium">{row.agent.name}</span>
                </span>
              </th>
              <td className={td}>{row.assigned}</td>
              <td className={td}>{row.replied}</td>
              <td className={td}>{row.resolved}</td>
              <td className={td}>{formatDuration(row.firstResponseMedian)}</td>
              <td className={td}>
                {formatPercent(row.csat)}
                {row.rated ? <span className="ml-1 text-xs text-muted-foreground">({row.rated})</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

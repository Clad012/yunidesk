import type { ReportTagRow } from "yunidesk";
import { copy } from "@/lib/copy";
import { TagChip } from "@/features/tags/tag-chip";
import { formatDuration } from "../lib/format";

const th = "px-3 py-2 font-medium";
const td = "px-3 py-2 text-right tabular-nums";

/** Per tag: conversations started, resolved and their median resolution time. */
export function TagsTable({ rows }: { rows: ReportTagRow[] }) {
  if (rows.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{copy.reports.noTags}</p>;
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[28rem] text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="bg-muted/60">
            <th scope="col" className={`${th} rounded-l-lg text-left`}>{copy.reports.tag}</th>
            <th scope="col" className={`${th} text-right`}>{copy.reports.conversations}</th>
            <th scope="col" className={`${th} text-right`}>{copy.reports.resolved}</th>
            <th scope="col" className={`${th} rounded-r-lg text-right`}>{copy.reports.medianResolution}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.tag.id}>
              <th scope="row" className="px-3 py-2 text-left font-normal">
                <TagChip tag={row.tag} />
              </th>
              <td className={td}>{row.conversations}</td>
              <td className={td}>{row.resolved}</td>
              <td className={td}>{formatDuration(row.resolutionMedian)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

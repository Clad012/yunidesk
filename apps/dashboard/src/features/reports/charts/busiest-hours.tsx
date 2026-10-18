import { useId, useState } from "react";
import { copy, fmt } from "@/lib/copy";
import { useElementWidth } from "@/hooks/use-element-width";
import { ChartTooltip } from "./chart-tooltip";
import { formatHour } from "./scale";
import { TableToggle } from "./table-toggle";

const LABEL_W = 36;
const CELL_H = 20;
const GAP = 2;
const AXIS_H = 18;
const LEVELS = 5;
const HOUR_LABELS = [0, 6, 12, 18];

/** 0 for an empty cell, then 1–5 by share of the busiest hour (one hue, light → dark). */
export function heatLevel(value: number, max: number): number {
  if (value <= 0 || max <= 0) return 0;
  return Math.max(1, Math.ceil((value / max) * LEVELS));
}

/** Conversations started per weekday (rows, Monday first) and hour (columns), in the viewer's time zone. */
export function BusiestHours({ grid }: { grid: number[][] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [hover, setHover] = useState<{ day: number; hour: number } | null>(null);
  const titleId = useId();
  const descId = useId();
  const max = Math.max(0, ...grid.flat());
  const cellW = Math.max(4, (width - LABEL_W) / 24);
  const height = 7 * CELL_H + AXIS_H;
  const busiest = grid.flatMap((row, day) => row.map((n, hour) => ({ n, day, hour }))).sort((a, b) => b.n - a.n)[0];
  const cellLabel = (day: number, hour: number) =>
    fmt(copy.reports.cell, { day: copy.reports.weekdays[day] ?? "", hour: formatHour(hour), n: grid[day]?.[hour] ?? 0 });

  return (
    <div className="flex flex-col gap-3">
      <div ref={ref} className="relative" style={{ height }} onPointerLeave={() => setHover(null)}>
        {width > 0 ? (
          <svg width={width} height={height} role="img" aria-labelledby={`${titleId} ${descId}`}>
            <title id={titleId}>{copy.reports.busiestHours}</title>
            <desc id={descId}>{busiest && busiest.n > 0 ? cellLabel(busiest.day, busiest.hour) : copy.reports.empty}</desc>
            {grid.map((row, day) => (
              <g key={day}>
                <text x={0} y={day * CELL_H + CELL_H / 2} dy="0.32em" className="fill-muted-foreground text-[11px]">
                  {copy.reports.weekdays[day]}
                </text>
                {row.map((n, hour) => (
                  <rect
                    key={hour}
                    x={LABEL_W + hour * cellW}
                    y={day * CELL_H}
                    width={Math.max(1, cellW - GAP)}
                    height={CELL_H - GAP}
                    rx={3}
                    fill={`var(--viz-heat-${heatLevel(n, max)})`}
                    stroke={hover?.day === day && hover.hour === hour ? "var(--foreground)" : "none"}
                    strokeWidth={1.5}
                    onPointerEnter={() => setHover({ day, hour })}
                  >
                    <title>{cellLabel(day, hour)}</title>
                  </rect>
                ))}
              </g>
            ))}
            {HOUR_LABELS.map((hour) => (
              <text key={hour} x={LABEL_W + hour * cellW} y={height - 4} className="fill-muted-foreground text-[11px]">
                {formatHour(hour)}
              </text>
            ))}
          </svg>
        ) : null}
        {hover ? (
          <ChartTooltip x={LABEL_W + (hover.hour + 1) * cellW} y={hover.day * CELL_H} width={width}>
            <p className="font-semibold tabular-nums">{grid[hover.day]?.[hover.hour] ?? 0}</p>
            <p className="text-muted-foreground">
              {copy.reports.weekdays[hover.day]} · {formatHour(hover.hour)}
            </p>
          </ChartTooltip>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5 self-end text-xs text-muted-foreground" aria-hidden>
        {copy.reports.fewer}
        {Array.from({ length: LEVELS + 1 }, (_, level) => (
          <span key={level} className="size-3 rounded-[3px]" style={{ background: `var(--viz-heat-${level})` }} />
        ))}
        {copy.reports.more}
      </div>
      <TableToggle>
        <table className="w-full text-xs">
          <caption className="sr-only">{copy.reports.busiestHours}</caption>
          <thead className="sticky top-0 bg-muted text-muted-foreground">
            <tr>
              <th scope="col" className="px-2 py-2 text-left font-medium">{copy.reports.hour}</th>
              {copy.reports.weekdays.map((d) => (
                <th key={d} scope="col" className="px-2 py-2 text-right font-medium">{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 24 }, (_, hour) => (
              <tr key={hour}>
                <th scope="row" className="px-2 py-1 text-left font-normal">{formatHour(hour)}</th>
                {grid.map((row, day) => (
                  <td key={day} className="px-2 py-1 text-right tabular-nums">{row[hour] ?? 0}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </TableToggle>
    </div>
  );
}

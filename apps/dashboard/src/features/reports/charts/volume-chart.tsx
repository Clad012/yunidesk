import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { ReportVolume } from "yunidesk";
import { copy } from "@/lib/copy";
import { useElementWidth } from "@/hooks/use-element-width";
import { ChartTooltip, TooltipRow } from "./chart-tooltip";
import { countTicks, formatDay } from "./scale";
import { TableToggle } from "./table-toggle";

const HEIGHT = 220;
const PAD = { top: 12, right: 12, bottom: 26, left: 36 };
const SERIES = [
  { key: "created", label: copy.reports.createdSeries, color: "var(--viz-created)" },
  { key: "resolved", label: copy.reports.resolvedSeries, color: "var(--viz-resolved)" },
] as const;

type Day = ReportVolume["days"][number];

/** Conversations started and resolved per day: two 2px lines, one axis, a crosshair readout. */
export function VolumeChart({ days }: { days: Day[] }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  const descId = useId();

  const ticks = countTicks(Math.max(0, ...days.flatMap((d) => [d.created, d.resolved])));
  const top = ticks[ticks.length - 1] ?? 1;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (days.length <= 1 ? plotW / 2 : (i / (days.length - 1)) * plotW);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const path = (key: "created" | "resolved") => days.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d[key]).toFixed(1)}`).join("");
  const totals = { created: days.reduce((s, d) => s + d.created, 0), resolved: days.reduce((s, d) => s + d.resolved, 0) };
  const labelIndexes = [...new Set([0, Math.floor((days.length - 1) / 2), days.length - 1])].filter((i) => i >= 0);

  const pick = (event: PointerEvent<SVGRectElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = days.length <= 1 ? 0 : (event.clientX - box.left) / box.width;
    setActive(Math.min(days.length - 1, Math.max(0, Math.round(ratio * (days.length - 1)))));
  };
  const onKey = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    setActive((current) => Math.min(days.length - 1, Math.max(0, (current ?? (step > 0 ? -1 : days.length)) + step)));
  };
  const day = active === null ? null : days[active];

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} aria-hidden />
            {s.label} <span className="font-medium text-foreground tabular-nums">{totals[s.key]}</span>
          </li>
        ))}
      </ul>
      <div ref={ref} className="relative" style={{ height: HEIGHT }}>
        {width > 0 ? (
          <svg
            width={width}
            height={HEIGHT}
            role="img"
            aria-labelledby={`${titleId} ${descId}`}
            tabIndex={0}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
            className="rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <title id={titleId}>{copy.reports.volume}</title>
            <desc id={descId}>
              {`${copy.reports.createdSeries}: ${totals.created}. ${copy.reports.resolvedSeries}: ${totals.resolved}. ${days[0] ? formatDay(days[0].date) : ""} – ${days.at(-1) ? formatDay(days.at(-1)!.date) : ""}.`}
            </desc>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--viz-axis)" : "var(--viz-grid)"} strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[11px] tabular-nums">
                  {t}
                </text>
              </g>
            ))}
            {labelIndexes.map((i) => (
              <text key={i} x={x(i)} y={HEIGHT - 6} textAnchor={i === 0 && days.length > 1 ? "start" : i === days.length - 1 && days.length > 1 ? "end" : "middle"} className="fill-muted-foreground text-[11px]">
                {formatDay(days[i]!.date)}
              </text>
            ))}
            {day && active !== null ? <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--viz-axis)" strokeWidth={1} /> : null}
            {SERIES.map((s) => (
              <g key={s.key}>
                <path d={path(s.key)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {(days.length === 1 ? [0] : day && active !== null ? [active] : [days.length - 1]).map((i) => (
                  <circle key={i} cx={x(i)} cy={y(days[i]![s.key])} r={4} fill={s.color} stroke="var(--card)" strokeWidth={2} />
                ))}
              </g>
            ))}
            <rect x={PAD.left - 8} y={0} width={plotW + 16} height={HEIGHT - PAD.bottom} fill="transparent" onPointerMove={pick} onPointerLeave={() => setActive(null)} />
          </svg>
        ) : null}
        {day && active !== null ? (
          <ChartTooltip x={x(active)} y={PAD.top} width={width}>
            <p className="mb-1 font-medium">{formatDay(day.date, true)}</p>
            {SERIES.map((s) => (
              <TooltipRow key={s.key} color={s.color} value={day[s.key]} label={s.label} />
            ))}
          </ChartTooltip>
        ) : null}
      </div>
      <TableToggle>
        <table className="w-full text-sm">
          <caption className="sr-only">{copy.reports.volume}</caption>
          <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">{copy.reports.date}</th>
              {SERIES.map((s) => (
                <th key={s.key} scope="col" className="px-3 py-2 text-right font-medium">{s.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <th scope="row" className="px-3 py-1.5 text-left font-normal">{formatDay(d.date, true)}</th>
                <td className="px-3 py-1.5 text-right tabular-nums">{d.created}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{d.resolved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableToggle>
    </div>
  );
}

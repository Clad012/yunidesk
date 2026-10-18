import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { compareMetric, type MetricKind } from "./lib/format";

export interface MetricTileProps {
  label: string;
  value: string;
  /** What exactly the number counts. */
  hint: string;
  /** A second line under the value (p90, the split…). */
  detail?: string;
  comparison?: {
    current: number | null;
    previous: number | null;
    kind: MetricKind;
    /** null: neither direction is better (volume). */
    upIsGood: boolean | null;
    label: string;
    emptyLabel: string;
  };
}

function Delta({ comparison }: { comparison: NonNullable<MetricTileProps["comparison"]> }) {
  const result = compareMetric(comparison.current, comparison.previous, comparison.kind);
  if (!result) return <p className="text-xs text-muted-foreground">{comparison.emptyLabel}</p>;
  const good = result.direction === "flat" || comparison.upIsGood === null ? null : (result.direction === "up") === comparison.upIsGood;
  const Icon = result.direction === "up" ? ArrowUpIcon : result.direction === "down" ? ArrowDownIcon : MinusIcon;
  return (
    <p className="flex items-center gap-1 text-xs text-muted-foreground">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-medium tabular-nums",
          good === true && "text-emerald-700 dark:text-emerald-400",
          good === false && "text-red-600 dark:text-red-400",
          good === null && "text-foreground",
        )}
      >
        <Icon className="size-3" aria-hidden />
        {result.text}
      </span>
      {comparison.label}
    </p>
  );
}

/** Label, value, what it counts and the change against the previous period. */
export function MetricTile({ label, value, hint, detail, comparison }: MetricTileProps) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-card p-4 shadow-xs ring-1 ring-foreground/5">
      <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
      <p className="text-2xl font-semibold tracking-tight">{value}</p>
      {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      {comparison ? <Delta comparison={comparison} /> : null}
      <p className="mt-auto pt-1 text-xs leading-relaxed text-muted-foreground/80">{hint}</p>
    </div>
  );
}

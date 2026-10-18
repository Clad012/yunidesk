import type { ReactNode } from "react";

/** A small readout placed over a chart at (x, y) in the chart's own pixels; flips left near the right edge. */
export function ChartTooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const flip = x > width - 180;
  return (
    <div
      role="presentation"
      className="pointer-events-none absolute z-10 min-w-36 rounded-lg bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg ring-1 ring-foreground/10"
      style={{ left: flip ? undefined : x + 12, right: flip ? width - x + 12 : undefined, top: Math.max(0, y - 12) }}
    >
      {children}
    </div>
  );
}

/** One row of a tooltip: a short line key in the series colour, the value first, then the name. */
export function TooltipRow({ color, value, label }: { color: string; value: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="h-0.5 w-3 rounded-full" style={{ background: color }} aria-hidden />
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

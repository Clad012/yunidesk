import { PlusIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { TimeRange } from "yunidesk";
import { copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fromInputTime, suggestRange, toInputTime } from "./hours-edit";

interface DayRowProps {
  day: number;
  ranges: TimeRange[];
  disabled: boolean;
  onChange: (ranges: TimeRange[]) => void;
  /** Extra button next to "Add hours" (Monday's "Copy to weekdays"). */
  action?: ReactNode;
}

/** One day of the week: its opening ranges, or "Closed". */
export function DayRow({ day, ranges, disabled, onChange, action }: DayRowProps) {
  const dayName = copy.businessHours.days[day] ?? "";
  const suggestion = suggestRange(ranges);
  const update = (index: number, patch: Partial<TimeRange>) =>
    onChange(ranges.map((range, i) => (i === index ? { ...range, ...patch } : range)));

  return (
    <div className="grid gap-2 py-3 sm:grid-cols-[7rem_minmax(0,1fr)] sm:gap-4">
      <span className="pt-2 text-sm font-medium">{dayName}</span>
      <div className="flex flex-col gap-2">
        {ranges.length === 0 ? <span className="pt-2 text-sm text-muted-foreground">{copy.businessHours.closed}</span> : null}
        {ranges.map((range, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              type="time"
              step={300}
              required
              aria-label={`${dayName} · ${copy.businessHours.from}`}
              value={toInputTime(range.from)}
              disabled={disabled}
              onChange={(e) => update(index, { from: fromInputTime(e.target.value, false) })}
              className="w-32"
            />
            <span className="text-muted-foreground" aria-hidden="true">
              –
            </span>
            <Input
              type="time"
              step={300}
              required
              aria-label={`${dayName} · ${copy.businessHours.to}`}
              value={toInputTime(range.to)}
              disabled={disabled}
              onChange={(e) => update(index, { to: fromInputTime(e.target.value, true) })}
              className="w-32"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={`${copy.businessHours.removeRange} (${dayName} ${range.from}–${range.to})`}
              disabled={disabled}
              onClick={() => onChange(ranges.filter((_, i) => i !== index))}
            >
              <XIcon />
            </Button>
          </div>
        ))}
        {!disabled && (suggestion || action) ? (
          <div className="flex flex-wrap gap-1">
            {suggestion ? (
              <Button type="button" variant="ghost" size="xs" onClick={() => onChange([...ranges, suggestion])}>
                <PlusIcon /> {copy.businessHours.addRange}
              </Button>
            ) : null}
            {action}
          </div>
        ) : null}
      </div>
    </div>
  );
}

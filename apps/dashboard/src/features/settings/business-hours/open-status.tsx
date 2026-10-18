import { availabilityAt, type BusinessHours } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { formatShortUntil } from "@/lib/time";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";

/** "Open now" or when it opens next, for the hours being edited (in the viewer's own time). */
export function OpenStatus({ hours }: { hours: BusinessHours }) {
  const now = useNow();
  const { open, nextOpenAt } = availabilityAt(hours, now);
  const text = open
    ? copy.businessHours.openNow
    : nextOpenAt === null
      ? copy.businessHours.closedNever
      : fmt(copy.businessHours.closedUntil, { when: formatShortUntil(nextOpenAt, now) });
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
      <span className={cn("size-2 shrink-0 rounded-full", open ? "bg-success" : "bg-amber-500")} aria-hidden="true" />
      {text}
    </p>
  );
}

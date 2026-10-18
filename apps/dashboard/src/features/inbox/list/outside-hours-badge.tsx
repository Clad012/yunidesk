import { Clock3Icon } from "lucide-react";
import { availabilityAt } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { formatShortUntil } from "@/lib/time";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { useNow } from "@/hooks/use-now";
import { Tip } from "@/components/ui/tooltip";

/** A small pill in the inbox header while the team is outside its business hours. */
export function OutsideHoursBadge() {
  const hours = useBootstrap().settings.businessHours;
  const now = useNow();
  if (!hours?.enabled) return null;
  const { open, nextOpenAt } = availabilityAt(hours, now);
  if (open) return null;
  const hint = nextOpenAt === null ? copy.businessHours.inboxBadgeNever : fmt(copy.businessHours.inboxBadgeHint, { when: formatShortUntil(nextOpenAt, now) });
  return (
    <Tip label={hint}>
      <span className="ml-auto flex shrink-0 items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300" tabIndex={0} aria-label={`${copy.businessHours.inboxBadge}. ${hint}`}>
        <Clock3Icon className="size-3" aria-hidden="true" />
        <span className="hidden xl:inline">{copy.businessHours.inboxBadge}</span>
      </span>
    </Tip>
  );
}

import { AlarmClockIcon, CircleCheckIcon, Clock3Icon, HandIcon, RotateCcwIcon, UserRoundIcon, type LucideIcon } from "lucide-react";
import type { SystemEvent, TimelineMessage } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { formatClock, formatUntil } from "@/lib/time";

export function eventText(event: SystemEvent): string {
  const agent = event.agentName ?? copy.events.automatic;
  switch (event.type) {
    case "resolved":
      return fmt(copy.events.resolved, { agent });
    case "reopened":
      return fmt(copy.events.reopened, { agent });
    case "snoozed":
      return fmt(copy.events.snoozed, { agent, time: formatUntil(event.until) });
    case "assigned":
      return event.assigneeName ? fmt(copy.events.assigned, { agent, assignee: event.assigneeName }) : fmt(copy.events.unassigned, { agent });
    case "handed_off":
      return copy.events.handedOff;
    case "away":
      return copy.events.away;
  }
}

const ICONS: Record<SystemEvent["type"], LucideIcon> = {
  resolved: CircleCheckIcon,
  reopened: RotateCcwIcon,
  snoozed: AlarmClockIcon,
  assigned: UserRoundIcon,
  handed_off: HandIcon,
  away: Clock3Icon,
};

export function EventRow({ message }: { message: TimelineMessage }) {
  if (!message.event) return null;
  const Icon = ICONS[message.event.type];
  return (
    <div className="flex items-center justify-center gap-1.5 py-1 text-xs text-muted-foreground">
      <Icon className="size-3.5" />
      <span>{eventText(message.event)}</span>
      <span className="opacity-60">· {formatClock(message.createdAt)}</span>
    </div>
  );
}

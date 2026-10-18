import { ArrowDownIcon, FlagIcon, MinusIcon, SirenIcon, type LucideIcon } from "lucide-react";
import type { ConversationPriority } from "yunidesk";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";

export const PRIORITY_ORDER: readonly ConversationPriority[] = ["urgent", "high", "normal", "low"];

export const PRIORITY_STYLE: Record<ConversationPriority, { icon: LucideIcon; className: string }> = {
  urgent: { icon: SirenIcon, className: "text-red-600 dark:text-red-400" },
  high: { icon: FlagIcon, className: "text-orange-600 dark:text-orange-400" },
  normal: { icon: MinusIcon, className: "text-muted-foreground" },
  low: { icon: ArrowDownIcon, className: "text-muted-foreground" },
};

export function PriorityIcon({ priority, className }: { priority: ConversationPriority; className?: string }) {
  const { icon: Icon, className: tone } = PRIORITY_STYLE[priority];
  return <Icon className={cn("size-4 shrink-0", tone, className)} aria-hidden />;
}

/** Shown on list rows for high and urgent only; normal and low stay quiet. */
export function PriorityMarker({ priority }: { priority: ConversationPriority }) {
  if (priority !== "high" && priority !== "urgent") return null;
  return (
    <Tip label={`${copy.priority.label}: ${copy.priority[priority]}`}>
      <span className="flex shrink-0" aria-label={copy.priority[priority]} role="img">
        <PriorityIcon priority={priority} className="size-3.5" />
      </span>
    </Tip>
  );
}

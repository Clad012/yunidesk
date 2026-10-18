import { CheckIcon } from "lucide-react";
import type { ConversationPriority } from "yunidesk";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PRIORITY_ORDER, PriorityIcon } from "../../lib/priority";

interface PriorityMenuProps {
  priority: ConversationPriority;
  onChange: (priority: ConversationPriority) => void;
}

export function PriorityMenu({ priority, onChange }: PriorityMenuProps) {
  const raised = priority === "high" || priority === "urgent";
  return (
    <DropdownMenu>
      <Tip label={copy.priority.label}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`${copy.priority.label}: ${copy.priority[priority]}`}
            className={cn("gap-1.5 text-muted-foreground hover:text-foreground", raised && "text-foreground")}
          >
            <PriorityIcon priority={priority} />
            {raised ? <span className="hidden xl:inline">{copy.priority[priority]}</span> : null}
          </Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{copy.priority.label}</DropdownMenuLabel>
        {PRIORITY_ORDER.map((p) => (
          <DropdownMenuItem key={p} onSelect={() => p !== priority && onChange(p)}>
            <PriorityIcon priority={p} />
            <span className="flex-1">{copy.priority[p]}</span>
            {p === priority ? <CheckIcon className="text-primary" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

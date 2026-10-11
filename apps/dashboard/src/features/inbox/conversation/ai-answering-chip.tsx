import { BotIcon } from "lucide-react";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";

/** Shown while the AI assistant is the one answering a conversation. */
export function AiAnsweringChip({ className }: { className?: string }) {
  return (
    <Tip label={copy.conversation.aiAnsweringHint}>
      <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-md bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary", className)}>
        <BotIcon className="size-3" /> {copy.conversation.aiAnswering}
      </span>
    </Tip>
  );
}

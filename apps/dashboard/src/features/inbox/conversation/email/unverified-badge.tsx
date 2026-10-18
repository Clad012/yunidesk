import { ShieldAlertIcon } from "lucide-react";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";

/** The From address of an email is not proof: shown when the sender's domain didn't vouch for it. */
export function UnverifiedBadge({ hint = copy.emailMessage.unverifiedHint, className }: { hint?: string; className?: string }) {
  return (
    <Tip label={<span className="block max-w-64">{hint}</span>}>
      <span
        tabIndex={0}
        className={cn("inline-flex shrink-0 items-center gap-1 rounded-md bg-note px-1.5 py-0.5 text-[11px] font-medium text-note-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40", className)}
      >
        <ShieldAlertIcon className="size-3" /> {copy.emailMessage.unverified}
      </span>
    </Tip>
  );
}

import { copy } from "@/lib/copy";
import { statusStore } from "@/lib/realtime/live";
import { useStore } from "@/lib/realtime/store";
import { cn } from "@/lib/utils";
import { Tip } from "@/components/ui/tooltip";

/** Realtime socket state, as a small dot on the rail. */
export function ConnectionDot() {
  const status = useStore(statusStore, (s) => s);
  return (
    <Tip label={copy.connection[status]} side="right">
      <span role="status" aria-label={copy.connection[status]} className="flex size-9 items-center justify-center">
        <span
          className={cn(
            "size-2 rounded-full transition-colors",
            status === "open" && "bg-success",
            status === "connecting" && "animate-pulse bg-amber-400",
            status === "closed" && "animate-pulse bg-destructive",
          )}
        />
      </span>
    </Tip>
  );
}

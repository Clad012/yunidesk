import { RotateCw, WifiOff } from "lucide-react";
import { useMessenger } from "../../state/context";
import { cn } from "../../lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("ys-skeleton rounded-lg", className)} />;
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { strings } = useMessenger();
  return (
    <div role="alert" className="ys-rise flex flex-col items-center gap-3 px-8 py-10 text-center">
      <p className="text-sm text-muted">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-soft px-4 py-2 text-sm font-medium text-fg transition-colors hover:bg-soft-strong"
        >
          <RotateCw className="size-3.5" aria-hidden="true" />
          {strings.retry}
        </button>
      )}
    </div>
  );
}

/** Shown while the realtime connection is coming back. */
export function ConnectionBanner() {
  const { strings, data } = useMessenger();
  if (data.status !== "ready" || data.connection !== "reconnecting") return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-3 z-30 flex justify-center">
      <div role="status" className="ys-rise flex items-center gap-2 rounded-full bg-fg px-3.5 py-1.5 text-xs font-medium text-surface shadow-card">
        <WifiOff className="size-3.5" aria-hidden="true" />
        {strings.connectionLost}
      </div>
    </div>
  );
}

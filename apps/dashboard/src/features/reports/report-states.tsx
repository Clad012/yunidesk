import { ChartColumnIcon, LockIcon, TriangleAlertIcon } from "lucide-react";
import { copy } from "@/lib/copy";
import { ApiError, errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label={copy.common.loading}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

/** Owners only (403), or anything else that went wrong, with a retry. */
export function ReportError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  const forbidden = error instanceof ApiError && error.status === 403;
  const Icon = forbidden ? LockIcon : TriangleAlertIcon;
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-16 text-center shadow-xs">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground"><Icon className="size-5" /></span>
      <p className="text-sm font-medium">{forbidden ? copy.reports.ownerOnly : copy.reports.loadFailed}</p>
      {forbidden ? null : (
        <>
          <p className="max-w-md text-sm text-muted-foreground">{errorMessage(error, copy.common.somethingWrong)}</p>
          <Button variant="outline" size="sm" onClick={onRetry}>{copy.common.retry}</Button>
        </>
      )}
    </div>
  );
}

export function ReportEmpty() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl bg-card px-6 py-12 text-center shadow-xs">
      <span className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><ChartColumnIcon className="size-5" /></span>
      <p className="text-sm font-medium">{copy.reports.empty}</p>
      <p className="text-sm text-muted-foreground">{copy.reports.emptyHint}</p>
    </div>
  );
}

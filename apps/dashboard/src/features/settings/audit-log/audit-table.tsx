import { ScrollTextIcon } from "lucide-react";
import type { AuditEntry } from "yunidesk";
import { copy } from "@/lib/copy";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { actionLabel, actorLabel, detailsLine } from "./audit-labels";

const FAILURES = new Set<AuditEntry["action"]>(["auth.sign_in_failed", "auth.sso_failed"]);
const COLUMNS = "grid grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1.2fr)] gap-3 md:grid-cols-[9.5rem_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1.6fr)]";

interface AuditTableProps {
  items: AuditEntry[];
  loading: boolean;
  error: string | null;
  filtered: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onMore: () => void;
  onRetry: () => void;
}

export function AuditTable({ items, loading, error, filtered, hasMore, loadingMore, onMore, onRetry }: AuditTableProps) {
  if (loading) return <div className="flex flex-col gap-2">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>;
  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-sm text-muted-foreground">
        {error}
        <Button size="sm" variant="outline" onClick={onRetry}>{copy.common.retry}</Button>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <p className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
        <ScrollTextIcon className="size-5" /> {filtered ? copy.audit.emptyFiltered : copy.audit.empty}
      </p>
    );
  }
  return (
    <div className="-mx-1 flex flex-col">
      <div className={cn(COLUMNS, "px-1 pb-2 text-xs font-medium text-muted-foreground")}>
        <span>{copy.audit.columnTime}</span>
        <span>{copy.audit.columnActor}</span>
        <span>{copy.audit.columnAction}</span>
        <span className="hidden md:block">{copy.audit.columnDetails}</span>
      </div>
      <ul className="divide-y">
        {items.map((entry) => (
          <li key={entry.id} className={cn(COLUMNS, "items-baseline px-1 py-2 text-sm")} title={entry.ip ? `${entry.ip} · ${entry.userAgent ?? ""}` : undefined}>
            <span className="text-xs text-muted-foreground tabular-nums">{formatDateTime(entry.createdAt)}</span>
            <span className="truncate">{actorLabel(entry)}</span>
            <span className={cn("truncate", FAILURES.has(entry.action) && "text-destructive")}>{actionLabel(entry)}</span>
            <span className="hidden truncate text-muted-foreground md:block">{detailsLine(entry)}</span>
          </li>
        ))}
      </ul>
      {hasMore ? (
        <Button variant="ghost" size="sm" className="mt-2 self-center" onClick={onMore} disabled={loadingMore}>
          {loadingMore ? copy.common.loading : copy.common.loadMore}
        </Button>
      ) : null}
    </div>
  );
}

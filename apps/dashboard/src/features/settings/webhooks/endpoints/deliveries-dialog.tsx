import { useQuery } from "@tanstack/react-query";
import type { WebhookDelivery, WebhookEndpoint } from "yunidesk";
import { RefreshCwIcon } from "lucide-react";
import { copy, fmt } from "@/lib/copy";
import { endpoints, queryKeys } from "@/lib/endpoints";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

const STATUS = {
  pending: { label: copy.endpoints.status_pending, variant: "warning" },
  succeeded: { label: copy.endpoints.status_succeeded, variant: "success" },
  failed: { label: copy.endpoints.status_failed, variant: "destructive" },
} as const;

function DeliveryRow({ delivery }: { delivery: WebhookDelivery }) {
  const status = STATUS[delivery.status];
  const result = delivery.lastStatusCode !== null ? fmt(copy.endpoints.httpStatus, { code: delivery.lastStatusCode }) : null;
  const attempts = delivery.attempts === 1 ? copy.endpoints.attempt : fmt(copy.endpoints.attempts, { n: delivery.attempts });
  const next = delivery.status === "pending" && delivery.nextAttemptAt ? fmt(copy.endpoints.nextAttempt, { time: formatDateTime(delivery.nextAttemptAt) }) : null;
  return (
    <li className="flex flex-col gap-1 py-2.5">
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate text-xs font-medium">{delivery.eventType}</code>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{[formatDateTime(delivery.createdAt), attempts, result, next].filter(Boolean).join(" · ")}</p>
      {delivery.lastError ? <p className="truncate font-mono text-[11px] text-destructive" title={delivery.lastError}>{delivery.lastError}</p> : null}
    </li>
  );
}

export function DeliveriesDialog({ endpoint, open, onClose }: { endpoint: WebhookEndpoint | null; open: boolean; onClose: () => void }) {
  const id = endpoint?.id ?? "";
  const deliveries = useQuery({ queryKey: queryKeys.webhookDeliveries(id), queryFn: () => endpoints.webhookDeliveries(id), enabled: open && endpoint !== null });
  const items = deliveries.data?.items ?? [];

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[min(40rem,calc(100dvh-4rem))] flex-col sm:max-w-xl">
        <DialogHeader className="pr-8">
          <DialogTitle>{copy.endpoints.deliveriesTitle}</DialogTitle>
          <DialogDescription className="truncate">{fmt(copy.endpoints.deliveriesHint, { url: endpoint?.url ?? "" })}</DialogDescription>
        </DialogHeader>
        <div>
          <Button size="xs" variant="outline" onClick={() => void deliveries.refetch()} disabled={deliveries.isFetching}>
            <RefreshCwIcon className={cn(deliveries.isFetching && "animate-spin")} /> {copy.endpoints.refresh}
          </Button>
        </div>
        <div className="-mx-6 min-h-0 flex-1 overflow-y-auto px-6 scrollbar-thin">
          {deliveries.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{copy.endpoints.deliveriesEmpty}</p>
          ) : (
            <ul className="divide-y">
              {items.map((d) => (
                <DeliveryRow key={d.id} delivery={d} />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

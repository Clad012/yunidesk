import type { WebhookEndpoint } from "yunidesk";
import { PlusIcon, WebhookIcon } from "lucide-react";
import { useState } from "react";
import { copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "../../confirm-dialog";
import { SettingsCard } from "../../settings-page";
import { AddEndpointDialog } from "./add-endpoint-dialog";
import { DeliveriesDialog } from "./deliveries-dialog";
import { EndpointRow, type EndpointAction } from "./endpoint-row";
import { SecretDialog } from "./secret-dialog";
import { useWebhookEndpoints } from "./use-webhook-endpoints";

/** Dialog targets keep their endpoint while closing, so the content doesn't change mid-animation. */
type Target<T> = (T & { endpoint: WebhookEndpoint; open: boolean }) | null;
const close = <T,>(t: Target<T>): Target<T> => (t ? { ...t, open: false } : t);

export function EndpointsCard() {
  const { list, create, patch, remove, roll, test } = useWebhookEndpoints(true);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<Target<{ kind: "roll" | "delete" }>>(null);
  const [deliveries, setDeliveries] = useState<Target<object>>(null);
  const [rolledSecret, setRolledSecret] = useState<string | null>(null);
  const items = list.data?.items ?? [];

  const onAction = (endpoint: WebhookEndpoint, action: EndpointAction) => {
    if (action === "test") test.mutate(endpoint.id);
    else if (action === "deliveries") setDeliveries({ endpoint, open: true });
    else if (action === "toggle") patch.mutate({ id: endpoint.id, body: { enabled: endpoint.status !== "enabled" } });
    else setConfirm({ kind: action, endpoint, open: true });
  };
  const onConfirm = () => {
    if (!confirm) return;
    if (confirm.kind === "delete") remove.mutate(confirm.endpoint.id);
    else roll.mutate(confirm.endpoint.id, { onSuccess: (r) => setRolledSecret(r.secret) });
  };

  return (
    <SettingsCard title={copy.endpoints.title} description={copy.endpoints.hint}>
      <div>
        <Button size="sm" onClick={() => (create.reset(), setAdding(true))}>
          <PlusIcon /> {copy.endpoints.add}
        </Button>
      </div>
      {list.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : items.length === 0 ? (
        <p className="flex flex-col items-center gap-2 rounded-lg bg-muted/50 py-6 text-sm text-muted-foreground">
          <WebhookIcon className="size-5" /> {copy.endpoints.empty}
        </p>
      ) : (
        <ul className="-mb-3.5 divide-y">
          {items.map((endpoint) => (
            <EndpointRow key={endpoint.id} endpoint={endpoint} onAction={(action) => onAction(endpoint, action)} />
          ))}
        </ul>
      )}
      {adding ? <AddEndpointDialog create={create} onClose={() => (create.reset(), setAdding(false))} /> : null}
      <ConfirmDialog
        open={confirm?.open ?? false}
        title={confirm?.kind === "delete" ? copy.endpoints.deleteTitle : copy.endpoints.rollTitle}
        body={confirm?.kind === "delete" ? copy.endpoints.deleteBody : copy.endpoints.rollBody}
        action={confirm?.kind === "delete" ? copy.common.delete : copy.endpoints.rollSecret}
        destructive={confirm?.kind === "delete"}
        onOpenChange={(open) => !open && setConfirm(close)}
        onConfirm={onConfirm}
      />
      <DeliveriesDialog endpoint={deliveries?.endpoint ?? null} open={deliveries?.open ?? false} onClose={() => setDeliveries(close)} />
      <SecretDialog secret={rolledSecret} onClose={() => setRolledSecret(null)} />
    </SettingsCard>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WebhookDelivery, WebhookEndpoint } from "yunidesk";
import { toast } from "sonner";
import { copy, fmt } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys, type WebhookEndpointPatch } from "@/lib/endpoints";

const toastError = (e: unknown) => toast.error(errorMessage(e, copy.common.somethingWrong));

function toastTestResult(delivery: WebhookDelivery | null): void {
  if (delivery?.status === "succeeded") {
    toast.success(fmt(copy.endpoints.testSucceeded, { code: delivery.lastStatusCode ?? 200 }));
  } else if (delivery?.status === "pending") {
    toast.warning(copy.endpoints.testPending, { description: delivery.lastError ?? undefined });
  } else {
    toast.error(copy.endpoints.testFailed, { description: delivery?.lastError ?? undefined });
  }
}

/** Webhook endpoints (owners only) and everything you can do to one. */
export function useWebhookEndpoints(enabled: boolean) {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: queryKeys.webhookEndpoints, queryFn: endpoints.webhookEndpoints, enabled });
  const refresh = () => void qc.invalidateQueries({ queryKey: queryKeys.webhookEndpoints });
  const replace = (next: WebhookEndpoint) =>
    qc.setQueryData<{ items: WebhookEndpoint[] }>(queryKeys.webhookEndpoints, (d) => (d ? { items: d.items.map((e) => (e.id === next.id ? next : e)) } : d));

  const create = useMutation({ mutationFn: endpoints.createWebhookEndpoint, onSuccess: refresh });
  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: WebhookEndpointPatch }) => endpoints.patchWebhookEndpoint(id, body),
    onSuccess: (next, { body }) => {
      replace(next);
      if (body.enabled !== undefined) toast.success(body.enabled ? copy.endpoints.enabledToast : copy.endpoints.disabledToast);
    },
    onError: toastError,
  });
  const remove = useMutation({
    mutationFn: endpoints.deleteWebhookEndpoint,
    onSuccess: () => (toast.success(copy.endpoints.deleted), refresh()),
    onError: toastError,
  });
  const roll = useMutation({ mutationFn: (id: string) => endpoints.rollWebhookSecret(id), onSuccess: (r) => replace(r.endpoint), onError: toastError });
  const test = useMutation({
    mutationFn: endpoints.testWebhookEndpoint,
    onSuccess: (delivery, id) => {
      toastTestResult(delivery);
      void qc.invalidateQueries({ queryKey: queryKeys.webhookDeliveries(id) });
    },
    onError: toastError,
  });

  return { list, create, patch, remove, roll, test };
}

export type WebhookEndpointsApi = ReturnType<typeof useWebhookEndpoints>;

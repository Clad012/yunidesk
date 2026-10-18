import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BellOffIcon, BellRingIcon, SmartphoneIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { errorMessage } from "@/lib/api";
import { copy, fmt } from "@/lib/copy";
import { endpoints, queryKeys } from "@/lib/endpoints";
import { useStore } from "@/lib/realtime/store";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { pushEndpointStore, turnOffPush, turnOnPush } from "@/features/push/push-device";
import { browserTraits, pushAvailability } from "@/features/push/push-support";
import { usePushPublicKey } from "./use-push-settings";

function Notice({ children }: { children: string }) {
  return <p className="rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground">{children}</p>;
}

/** "Push notifications on this device": explains what's missing, or turns it on/off and sends a test. */
export function PushDeviceRow({ devices }: { devices: number | undefined }) {
  const qc = useQueryClient();
  const [traits, setTraits] = useState(browserTraits);
  const availability = pushAvailability(traits);
  const endpoint = useStore(pushEndpointStore, (s) => s);
  const publicKey = usePushPublicKey(availability === "ready");
  const refresh = () => void qc.invalidateQueries({ queryKey: queryKeys.pushSettings });
  const onError = (error: Error) => toast.error(errorMessage(error, copy.common.somethingWrong));

  const turnOn = useMutation({
    mutationFn: () => turnOnPush(publicKey.data!.publicKey),
    onSuccess: (permission) => {
      setTraits(browserTraits());
      if (permission === "granted") toast.success(copy.push.turnedOn);
      else if (permission === "default") toast.message(copy.push.dismissedPrompt);
      refresh();
    },
    onError,
  });
  const turnOff = useMutation({ mutationFn: turnOffPush, onSuccess: () => (toast.success(copy.push.turnedOff), refresh()), onError });
  const test = useMutation({
    mutationFn: (to: string) => endpoints.pushTest(to),
    onSuccess: (result) => (result.outcome === "delivered" ? toast.success(copy.push.testSent) : toast.error(copy.push.testFailed)),
    onError,
  });

  if (availability === "unsupported") return <Notice>{copy.push.unsupported}</Notice>;
  if (availability === "install") return <Notice>{copy.push.install}</Notice>;
  if (availability === "denied") return <Notice>{copy.push.denied}</Notice>;
  if (endpoint === undefined) return <Skeleton className="h-14 w-full rounded-lg" />;

  const on = endpoint !== null;
  const busy = turnOn.isPending || turnOff.isPending;
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-muted/60 p-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <SmartphoneIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium">{copy.push.device}</p>
          <p className="text-xs text-muted-foreground">
            {on ? copy.push.deviceOn : copy.push.deviceOff}
            {devices ? ` ${fmt(copy.push.otherDevices, { count: devices })}` : ""}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {on ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => test.mutate(endpoint)} disabled={test.isPending}>
              <BellRingIcon /> {copy.push.sendTest}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => turnOff.mutate()} disabled={busy}>
              <BellOffIcon /> {copy.push.turnOff}
            </Button>
          </>
        ) : publicKey.isError ? (
          <Button size="sm" variant="secondary" onClick={() => void publicKey.refetch()}>
            {copy.common.retry}
          </Button>
        ) : (
          <Button size="sm" onClick={() => turnOn.mutate()} disabled={busy || !publicKey.data}>
            {turnOn.isPending ? copy.push.turningOn : copy.push.turnOn}
          </Button>
        )}
      </div>
    </div>
  );
}

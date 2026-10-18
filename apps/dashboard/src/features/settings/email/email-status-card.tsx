import { useMutation } from "@tanstack/react-query";
import { SendIcon } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";
import type { EmailChannelSettings } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { formatDateTime } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "../settings-page";

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 truncate text-sm">{children}</dd>
    </div>
  );
}

export function EmailStatusCard({ saved, canTest }: { saved: EmailChannelSettings; canTest: boolean }) {
  const { status } = saved;
  const test = useMutation({
    mutationFn: endpoints.testEmail,
    onSuccess: (result) =>
      result.ok ? toast.success(fmt(copy.emailChannel.testSent, { email: result.to })) : toast.error(fmt(copy.emailChannel.testFailed, { error: result.error ?? "" })),
    onError: (error) => toast.error(errorMessage(error, copy.common.somethingWrong)),
  });
  const provider = status.activeProvider ? copy.emailChannel[`provider_${status.activeProvider}`] : null;
  return (
    <SettingsCard title={copy.emailChannel.statusTitle}>
      <dl className="grid gap-3 sm:grid-cols-2">
        <Item label={copy.emailChannel.activeProvider}>
          {provider ?? <span className="text-destructive">{copy.emailChannel.noProvider}</span>}
        </Item>
        <Item label={copy.emailChannel.replyAddresses}>
          {status.replyDomain ? <span className="font-mono text-xs">reply+…@{status.replyDomain}</span> : <span className="text-muted-foreground">{copy.emailChannel.notReady}</span>}
        </Item>
        <Item label={copy.emailChannel.lastInbound}>{status.lastInboundAt ? formatDateTime(status.lastInboundAt) : copy.common.never}</Item>
        <Item label={copy.emailChannel.lastOutbound}>{status.lastOutboundAt ? formatDateTime(status.lastOutboundAt) : copy.common.never}</Item>
      </dl>
      {canTest ? (
        <Button variant="outline" size="sm" className="w-fit" disabled={!status.activeProvider || test.isPending} onClick={() => test.mutate()}>
          <SendIcon /> {test.isPending ? copy.emailChannel.sendingTest : copy.emailChannel.sendTest}
        </Button>
      ) : null}
    </SettingsCard>
  );
}

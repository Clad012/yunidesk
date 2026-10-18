import { CircleCheckIcon, CircleIcon } from "lucide-react";
import type { EmailChannelSettings } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { SettingsCard } from "../settings-page";

interface Step {
  title: string;
  hint?: string;
  /** null: can't be checked from here. */
  done: boolean | null;
}

/** DNS and Email Routing steps; the ones the server can see are ticked for real. */
export function EmailChecklistCard({ saved }: { saved: EmailChannelSettings }) {
  const { status } = saved;
  const address = saved.inboundAddress ?? copy.emailChannel.inboundPlaceholder;
  const domain = status.replyDomain ?? address.split("@")[1] ?? "example.com";
  const fromDomain = status.effectiveFromAddress?.split("@")[1] ?? domain;
  const steps: Step[] = [
    { title: fmt(copy.emailChannel.step_routing, { address }), hint: copy.emailChannel.step_routingHint, done: status.lastInboundAt !== null || null },
    { title: fmt(copy.emailChannel.step_subaddress, { domain }), hint: fmt(copy.emailChannel.step_subaddressHint, { domain }), done: null },
    { title: copy.emailChannel.step_sending, hint: copy.emailChannel.step_sendingHint, done: status.activeProvider !== null },
    { title: fmt(copy.emailChannel.step_dns, { domain: fromDomain }), hint: copy.emailChannel.step_dnsHint, done: status.lastOutboundAt !== null || null },
    { title: fmt(copy.emailChannel.step_test, { address }), done: status.lastInboundAt !== null && status.lastOutboundAt !== null },
  ];
  return (
    <SettingsCard title={copy.emailChannel.checklistTitle} description={copy.emailChannel.checklistHint}>
      <ol className="flex flex-col gap-3">
        {steps.map((step) => (
          <li key={step.title} className="flex gap-2.5">
            {step.done ? (
              <CircleCheckIcon className="mt-0.5 size-4 shrink-0 text-success" aria-label={copy.emailChannel.ready} />
            ) : (
              <CircleIcon className={cn("mt-0.5 size-4 shrink-0", step.done === false ? "text-destructive" : "text-muted-foreground")} aria-label={copy.emailChannel.notReady} />
            )}
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm">{step.title}</span>
              {step.hint ? <span className="text-xs text-muted-foreground">{step.hint}</span> : null}
            </div>
          </li>
        ))}
      </ol>
    </SettingsCard>
  );
}

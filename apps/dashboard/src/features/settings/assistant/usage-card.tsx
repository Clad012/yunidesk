import { useQuery } from "@tanstack/react-query";
import { copy, fmt } from "@/lib/copy";
import { endpoints, queryKeys } from "@/lib/endpoints";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsCard } from "../settings-page";

/** "$0.42"; a tiny but real spend reads "< $0.01", not "$0.00". */
const usd = (amount: number) => (amount > 0 && amount < 0.005 ? copy.assistant.underOneCent : `$${amount.toFixed(2)}`);

export function UsageCard() {
  const usage = useQuery({ queryKey: queryKeys.assistantUsage, queryFn: endpoints.assistantUsage, refetchInterval: 60_000 });
  const data = usage.data;
  const ratio = data && data.budgetUsd > 0 ? Math.min(1, data.costUsd / data.budgetUsd) : 0;

  return (
    <SettingsCard title={copy.assistant.usageTitle} description={copy.assistant.usageHint}>
      {!data ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-xs text-muted-foreground">{copy.assistant.usageReplies}</dt>
              <dd className="text-lg font-semibold tabular-nums">{data.replies}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{copy.assistant.usageCost}</dt>
              <dd className="text-sm tabular-nums">
                <span className="text-lg font-semibold">{usd(data.costUsd)}</span>{" "}
                <span className="text-muted-foreground">{fmt(copy.assistant.usageOfBudget, { budget: usd(data.budgetUsd) })}</span>
              </dd>
            </div>
          </dl>
          <div
            role="progressbar"
            aria-label={fmt(copy.assistant.usageOf, { cost: usd(data.costUsd), budget: usd(data.budgetUsd) })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(ratio * 100)}
            className="h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <div className={cn("h-full rounded-full transition-[width]", ratio >= 1 ? "bg-destructive" : ratio >= 0.8 ? "bg-amber-500" : "bg-primary")} style={{ width: `${ratio * 100}%` }} />
          </div>
        </>
      )}
    </SettingsCard>
  );
}

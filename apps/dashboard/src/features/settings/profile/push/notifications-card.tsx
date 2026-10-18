import type { PushPreferences } from "yunidesk";
import { copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleRow } from "../../assistant/toggle-row";
import { SettingsCard } from "../../settings-page";
import { PushDeviceRow } from "./push-device-row";
import { usePushSettings } from "./use-push-settings";

const KINDS: { key: keyof PushPreferences; label: string; hint: string }[] = [
  { key: "newConversation", label: copy.push.newConversation, hint: copy.push.newConversationHint },
  { key: "assignedMessage", label: copy.push.assignedMessage, hint: copy.push.assignedMessageHint },
  { key: "assigned", label: copy.push.assigned, hint: copy.push.assignedHint },
  { key: "handoff", label: copy.push.handoff, hint: copy.push.handoffHint },
];

/** Settings → Profile → Notifications: this device on/off, and what to be notified about. */
export function NotificationsCard() {
  const { query, save } = usePushSettings();
  return (
    <SettingsCard title={copy.push.title} description={copy.push.subtitle}>
      <PushDeviceRow devices={query.data?.devices} />
      <div className="flex flex-col gap-3">
        <div>
          <h4 className="text-sm font-medium">{copy.push.whatTitle}</h4>
          <p className="text-xs text-muted-foreground">{copy.push.whatHint}</p>
        </div>
        {query.isPending ? (
          <Skeleton className="h-40 w-full rounded-lg" />
        ) : query.isError ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {copy.common.somethingWrong}
            <Button size="xs" variant="secondary" onClick={() => void query.refetch()}>
              {copy.common.retry}
            </Button>
          </div>
        ) : (
          KINDS.map((kind) => (
            <ToggleRow
              key={kind.key}
              label={kind.label}
              hint={kind.hint}
              checked={query.data.preferences[kind.key]}
              disabled={false}
              onChange={(checked) => save.mutate({ [kind.key]: checked })}
            />
          ))
        )}
      </div>
    </SettingsCard>
  );
}

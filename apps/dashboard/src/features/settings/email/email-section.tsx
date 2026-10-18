import { useQuery } from "@tanstack/react-query";
import type { EmailChannelSettings } from "yunidesk";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys } from "@/lib/endpoints";
import { useIsOwner } from "@/hooks/use-bootstrap";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SaveBar, SettingsPage } from "../settings-page";
import { EmailChecklistCard } from "./email-checklist-card";
import { EmailSettingsCard } from "./email-settings-card";
import { EmailStatusCard } from "./email-status-card";
import { useEmailForm } from "./use-email-form";

export function EmailSection() {
  const isOwner = useIsOwner();
  const settings = useQuery({ queryKey: queryKeys.emailChannel, queryFn: endpoints.emailChannel });
  return (
    <SettingsPage title={copy.emailChannel.title} subtitle={copy.emailChannel.subtitle} ownerOnly={!isOwner}>
      {settings.data ? (
        <EmailForm saved={settings.data} isOwner={isOwner} />
      ) : settings.isError ? (
        <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-5 text-sm">
          <span className="flex-1 text-destructive">{errorMessage(settings.error, copy.common.somethingWrong)}</span>
          <Button size="sm" variant="outline" onClick={() => void settings.refetch()}>
            {copy.common.retry}
          </Button>
        </div>
      ) : (
        <Skeleton className="h-96 w-full rounded-xl" />
      )}
    </SettingsPage>
  );
}

function EmailForm({ saved, isOwner }: { saved: EmailChannelSettings; isOwner: boolean }) {
  const form = useEmailForm(saved);
  return (
    <>
      <EmailSettingsCard form={form} saved={saved} disabled={!isOwner} />
      <EmailStatusCard saved={saved} canTest={isOwner && !form.dirty} />
      <EmailChecklistCard saved={saved} />
      <SaveBar dirty={form.dirty && form.valid} saving={form.saving} onSave={form.save} onDiscard={form.discard} />
    </>
  );
}

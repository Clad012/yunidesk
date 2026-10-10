import { KeyRoundIcon, PlusIcon, ShieldAlertIcon } from "lucide-react";
import { useState } from "react";
import { copy } from "@/lib/copy";
import { useIsOwner } from "@/hooks/use-bootstrap";
import { useNow } from "@/hooks/use-now";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsCard, SettingsPage } from "../settings-page";
import { ApiKeyRow } from "./api-key-row";
import { CreateApiKeyDialog } from "./create-api-key-dialog";
import { useApiKeys } from "./use-api-keys";

export function ApiKeysSection() {
  const isOwner = useIsOwner();
  const { keys, create, revoke } = useApiKeys(isOwner);
  const [creating, setCreating] = useState(false);
  const now = useNow();
  const items = keys.data?.items ?? [];

  return (
    <SettingsPage title={copy.apiKeys.title} subtitle={copy.apiKeys.subtitle} ownerOnly={!isOwner}>
      <SettingsCard title={copy.apiKeys.about}>
        <p className="-mt-2 text-sm text-muted-foreground">{copy.apiKeys.aboutBody}</p>
        <p className="flex items-start gap-2 rounded-lg bg-note px-3 py-2.5 text-sm text-note-foreground">
          <ShieldAlertIcon className="mt-0.5 size-4 shrink-0" /> {copy.apiKeys.warning}
        </p>
      </SettingsCard>
      {isOwner ? (
        <>
          <div>
            <Button onClick={() => (create.reset(), setCreating(true))}>
              <PlusIcon /> {copy.apiKeys.create}
            </Button>
          </div>
          <SettingsCard title={copy.apiKeys.keys}>
            {keys.isPending ? (
              <Skeleton className="h-20 w-full" />
            ) : items.length === 0 ? (
              <p className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
                <KeyRoundIcon className="size-5" /> {copy.apiKeys.empty}
              </p>
            ) : (
              <ul className="-my-3.5 divide-y">
                {items.map((key) => (
                  <ApiKeyRow key={key.id} apiKey={key} now={now} onRevoke={() => revoke.mutate(key.id)} />
                ))}
              </ul>
            )}
          </SettingsCard>
        </>
      ) : null}
      {creating ? <CreateApiKeyDialog create={create} onClose={() => (create.reset(), setCreating(false))} /> : null}
    </SettingsPage>
  );
}

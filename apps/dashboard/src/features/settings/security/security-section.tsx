import { useQuery } from "@tanstack/react-query";
import type { SsoSettings } from "yunidesk";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys } from "@/lib/endpoints";
import { useCan } from "@/hooks/use-bootstrap";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SaveBar, SettingsPage } from "../settings-page";
import { SsoAccessCard } from "./sso-access-card";
import { SsoProviderCard } from "./sso-provider-card";
import { useSsoForm } from "./use-sso-form";

/** Single sign-on with any OpenID Connect provider. Owners only. */
export function SecuritySection() {
  const canManage = useCan("sso.manage");
  const sso = useQuery({ queryKey: queryKeys.sso, queryFn: endpoints.sso, enabled: canManage });

  return (
    <SettingsPage title={copy.security.title} subtitle={copy.security.subtitle}>
      {!canManage ? (
        <p className="text-sm text-muted-foreground">{copy.security.locked}</p>
      ) : sso.isError ? (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          {errorMessage(sso.error, copy.common.somethingWrong)}
          <Button size="sm" variant="outline" onClick={() => void sso.refetch()}>{copy.common.retry}</Button>
        </div>
      ) : !sso.data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <SsoForm saved={sso.data} />
      )}
    </SettingsPage>
  );
}

function SsoForm({ saved }: { saved: SsoSettings }) {
  const form = useSsoForm(saved);
  return (
    <>
      <SsoProviderCard form={form} />
      <SsoAccessCard form={form} />
      <SaveBar dirty={form.dirty} saving={form.saving} onSave={form.save} onDiscard={form.discard} />
    </>
  );
}

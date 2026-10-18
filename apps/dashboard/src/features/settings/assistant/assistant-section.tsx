import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { AssistantSettings } from "yunidesk";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys } from "@/lib/endpoints";
import { useCan } from "@/hooks/use-bootstrap";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SaveBar, SettingsPage } from "../settings-page";
import { AssistantSettingsCard } from "./assistant-settings-card";
import { HelpCenterCard } from "./help-center/help-center-card";
import { KnowledgeCard } from "./knowledge/knowledge-card";
import { OpenRouterKeyCard } from "./openrouter-key-card";
import { ToolsCard } from "./tools/tools-card";
import { TryItCard } from "./try-it-card";
import { UsageCard } from "./usage-card";
import { useAssistantForm } from "./use-assistant-form";

export function AssistantSection() {
  const isOwner = useCan("assistant.manage");
  const settings = useQuery({ queryKey: queryKeys.assistant, queryFn: endpoints.assistant });
  const lists = (
    <>
      <KnowledgeCard editable={isOwner} />
      <HelpCenterCard />
      <ToolsCard editable={isOwner} />
    </>
  );

  return (
    <SettingsPage title={copy.assistant.title} subtitle={copy.assistant.subtitle} ownerOnly={!isOwner}>
      {settings.data ? (
        <AssistantSettingsForm saved={settings.data} isOwner={isOwner}>
          {lists}
        </AssistantSettingsForm>
      ) : settings.isError ? (
        <>
          <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-5 text-sm">
            <span className="flex-1 text-destructive">{errorMessage(settings.error, copy.common.somethingWrong)}</span>
            <Button size="sm" variant="outline" onClick={() => void settings.refetch()}>
              {copy.common.retry}
            </Button>
          </div>
          {lists}
        </>
      ) : (
        <>
          <Skeleton className="h-96 w-full rounded-xl" />
          {lists}
        </>
      )}
    </SettingsPage>
  );
}

/** The parts that need the saved settings: the form, the key and the test box; the save bar stays last on the page. */
function AssistantSettingsForm({ saved, isOwner, children }: { saved: AssistantSettings; isOwner: boolean; children: ReactNode }) {
  const form = useAssistantForm(saved);
  return (
    <>
      <AssistantSettingsCard form={form} disabled={!isOwner} />
      <div className="grid gap-6 md:grid-cols-2">
        <OpenRouterKeyCard hasKey={saved.hasOpenRouterKey} disabled={!isOwner} />
        <UsageCard />
      </div>
      {isOwner ? <TryItCard /> : null}
      {children}
      <SaveBar dirty={form.dirty && form.valid} saving={form.saving} onSave={form.save} onDiscard={form.discard} />
    </>
  );
}

import { copy } from "@/lib/copy";
import { CodeBlock } from "../code-block";
import { SaveBar, SettingsCard, SettingsPage } from "../settings-page";
import { useSettingsForm } from "../use-settings-form";
import { OriginsEditor } from "./origins-editor";
import { identitySnippet, reactNativeSnippet, reactSnippet, websiteSnippet } from "./snippets";

export function InstallSection() {
  const form = useSettingsForm(["allowedOrigins"] as const);
  const origin = window.location.origin;
  return (
    <SettingsPage title={copy.install.title} subtitle={copy.install.subtitle}>
      <SettingsCard title={copy.install.website} description={copy.install.websiteHint}>
        <CodeBlock code={websiteSnippet(origin)} label="HTML" />
        <p className="text-xs text-muted-foreground">{copy.install.loaderNote}</p>
      </SettingsCard>
      <SettingsCard title={copy.install.origins} description={copy.install.originsHint}>
        <OriginsEditor origins={form.value.allowedOrigins} disabled={!form.canEdit} onChange={(next) => form.set("allowedOrigins", next)} />
        {!form.canEdit ? <p className="text-xs text-muted-foreground">{copy.common.ownerOnly}</p> : null}
      </SettingsCard>
      <SettingsCard title={copy.install.identity} description={copy.install.identityHint}>
        <CodeBlock code={identitySnippet} label={copy.install.identityServer} />
      </SettingsCard>
      <SettingsCard title={copy.install.react}>
        <CodeBlock code={reactSnippet(origin)} label="TSX" />
      </SettingsCard>
      <SettingsCard title={copy.install.reactNative}>
        <CodeBlock code={reactNativeSnippet(origin)} label="TSX" />
      </SettingsCard>
      <SaveBar dirty={form.dirty} saving={form.saving} onSave={form.save} onDiscard={form.discard} />
    </SettingsPage>
  );
}

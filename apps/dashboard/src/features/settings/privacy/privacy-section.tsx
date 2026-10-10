import { DatabaseIcon, DownloadIcon, ServerIcon, Trash2Icon, type LucideIcon } from "lucide-react";
import { copy } from "@/lib/copy";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { SaveBar, SettingsCard, SettingsPage } from "../settings-page";
import { useSettingsForm } from "../use-settings-form";

const FACTS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: ServerIcon, title: copy.privacy.storage, body: copy.privacy.storageBody },
  { icon: DownloadIcon, title: copy.privacy.access, body: copy.privacy.accessBody },
  { icon: Trash2Icon, title: copy.privacy.erasure, body: copy.privacy.erasureBody },
  { icon: DatabaseIcon, title: copy.privacy.automatic, body: copy.privacy.automaticBody },
];

export function PrivacySection() {
  const form = useSettingsForm(["retentionDays"] as const);
  const days = form.value.retentionDays;
  const valid = Number.isInteger(days) && days >= 30 && days <= 3650;
  return (
    <SettingsPage title={copy.privacy.title} subtitle={copy.privacy.subtitle} ownerOnly={!form.isOwner}>
      <SettingsCard>
        <Field label={copy.privacy.retention} hint={copy.privacy.retentionHint} error={valid ? null : copy.privacy.retentionHint}>
          {(id) => (
            <div className="flex items-center gap-2">
              <Input id={id} type="number" min={30} max={3650} step={1} value={Number.isFinite(days) ? days : ""} disabled={!form.isOwner} onChange={(e) => form.set("retentionDays", e.target.valueAsNumber)} className="w-28 tabular-nums" />
              <span className="text-sm text-muted-foreground">{copy.privacy.retentionUnit}</span>
            </div>
          )}
        </Field>
      </SettingsCard>
      <SettingsCard title={copy.privacy.gdpr}>
        <ul className="grid gap-4 sm:grid-cols-2">
          {FACTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="size-4" />
              </span>
              <span>
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-sm text-muted-foreground">{body}</span>
              </span>
            </li>
          ))}
        </ul>
      </SettingsCard>
      <SaveBar dirty={form.dirty && valid} saving={form.saving} onSave={form.save} onDiscard={form.discard} />
    </SettingsPage>
  );
}

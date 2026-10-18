import type { HelpCenterSettings, Locale } from "yunidesk";
import { ExternalLinkIcon } from "lucide-react";
import { useState } from "react";
import { copy, fmt } from "@/lib/copy";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SettingsCard } from "../../settings-page";
import { useSettingsForm } from "../../use-settings-form";
import { ToggleRow } from "../toggle-row";
import { helpCenterBaseUrl } from "./help-center-url";

const KEYS = ["helpCenter"] as const;
const OFF: HelpCenterSettings = { enabled: false, title: {}, description: {} };

/** Turns the public help center on, and sets its title and description per language. Saves on its own. */
export function HelpCenterCard() {
  const form = useSettingsForm(KEYS);
  const settings = form.value.helpCenter ?? OFF;
  const disabled = !form.isOwner;
  const [lang, setLang] = useState<Locale>("en");
  const url = helpCenterBaseUrl();
  const set = (patch: Partial<HelpCenterSettings>) => form.set("helpCenter", { ...settings, ...patch });
  const team = { team: form.value.teamName };

  return (
    <SettingsCard title={copy.helpCenter.title} description={copy.helpCenter.description}>
      <ToggleRow
        label={copy.helpCenter.enable}
        hint={copy.helpCenter.enableHint}
        checked={settings.enabled}
        disabled={disabled}
        onChange={(enabled) => set({ enabled })}
      />
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
        <span className="text-muted-foreground">{copy.helpCenter.publicUrl}</span>
        <code className="min-w-0 flex-1 truncate font-mono text-xs">{url}</code>
        {settings.enabled ? (
          <Button size="sm" variant="ghost" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLinkIcon /> {copy.helpCenter.open}
            </a>
          </Button>
        ) : null}
      </div>
      <Tabs value={lang} onValueChange={(v) => setLang(v as Locale)}>
        <TabsList>
          <TabsTrigger value="en">{copy.helpCenter.english}</TabsTrigger>
          <TabsTrigger value="fr">{copy.helpCenter.french}</TabsTrigger>
        </TabsList>
      </Tabs>
      <Field label={copy.helpCenter.pageTitle}>
        {(id) => (
          <Input
            id={id}
            maxLength={80}
            disabled={disabled}
            placeholder={fmt(copy.helpCenter.pageTitlePlaceholder, team)}
            value={settings.title[lang] ?? ""}
            onChange={(e) => set({ title: { ...settings.title, [lang]: e.target.value } })}
          />
        )}
      </Field>
      <Field label={copy.helpCenter.pageDescription} hint={copy.helpCenter.chatHint}>
        {(id) => (
          <Textarea
            id={id}
            rows={2}
            maxLength={300}
            disabled={disabled}
            placeholder={fmt(copy.helpCenter.pageDescriptionPlaceholder, team)}
            value={settings.description?.[lang] ?? ""}
            onChange={(e) => set({ description: { ...settings.description, [lang]: e.target.value } })}
          />
        )}
      </Field>
      {form.dirty ? (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={form.discard} disabled={form.saving}>
            {copy.settings.discard}
          </Button>
          <Button size="sm" onClick={form.save} disabled={form.saving}>
            {form.saving ? copy.common.saving : copy.common.save}
          </Button>
        </div>
      ) : null}
    </SettingsCard>
  );
}

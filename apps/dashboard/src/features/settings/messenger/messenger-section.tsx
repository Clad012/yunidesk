import type { LocalizedText, ReplyTime } from "yunidesk";
import { useState } from "react";
import { copy } from "@/lib/copy";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SaveBar, SettingsCard, SettingsPage } from "../settings-page";
import { useSettingsForm } from "../use-settings-form";
import { MessengerPreview } from "./messenger-preview";

const KEYS = ["teamName", "brandColor", "greeting", "intro", "replyTime", "launcherPosition", "allowAnonymous", "askEmailForAnonymous"] as const;
type Lang = "en" | "fr";

function ToggleRow({ label, hint, checked, disabled, onChange }: { label: string; hint: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start justify-between gap-4">
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </label>
  );
}

export function MessengerSection() {
  const form = useSettingsForm(KEYS);
  const { value: s, canEdit } = form;
  const [lang, setLang] = useState<Lang>("en");
  const disabled = !canEdit;
  const setText = (key: "greeting" | "intro", text: string) => form.set(key, { ...s[key], [lang]: text } as LocalizedText);
  const validColor = /^#[0-9a-fA-F]{6}$/.test(s.brandColor);

  return (
    <SettingsPage title={copy.messenger.title} subtitle={copy.messenger.subtitle} ownerOnly={!canEdit}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4">
          <SettingsCard>
            <Field label={copy.messenger.teamName}>{(id) => <Input id={id} value={s.teamName} maxLength={60} disabled={disabled} onChange={(e) => form.set("teamName", e.target.value)} />}</Field>
            <Field label={copy.messenger.brandColor} error={validColor ? null : copy.messenger.badColor}>
              {(id) => (
                <div className="flex items-center gap-2">
                  <input type="color" aria-label={copy.messenger.brandColor} value={validColor ? s.brandColor : "#6d5dfc"} disabled={disabled} onChange={(e) => form.set("brandColor", e.target.value)} className="size-9 cursor-pointer rounded-lg border bg-transparent p-1 disabled:cursor-not-allowed" />
                  <Input id={id} value={s.brandColor} maxLength={7} disabled={disabled} onChange={(e) => form.set("brandColor", e.target.value)} className="w-32 font-mono" />
                </div>
              )}
            </Field>
          </SettingsCard>
          <SettingsCard>
            <Tabs value={lang} onValueChange={(v) => setLang(v as Lang)}>
              <TabsList>
                <TabsTrigger value="en">{copy.messenger.english}</TabsTrigger>
                <TabsTrigger value="fr">{copy.messenger.french}</TabsTrigger>
              </TabsList>
            </Tabs>
            <Field label={copy.messenger.greeting}>{(id) => <Input id={id} value={s.greeting[lang] ?? ""} maxLength={200} placeholder={copy.messenger.greetingPlaceholder} disabled={disabled} onChange={(e) => setText("greeting", e.target.value)} />}</Field>
            <Field label={copy.messenger.intro}>{(id) => <Input id={id} value={s.intro[lang] ?? ""} maxLength={200} placeholder={copy.messenger.introPlaceholder} disabled={disabled} onChange={(e) => setText("intro", e.target.value)} />}</Field>
          </SettingsCard>
          <SettingsCard>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={copy.messenger.replyTime}>
                {(id) => (
                  <Select value={s.replyTime} onValueChange={(v) => form.set("replyTime", v as ReplyTime)} disabled={disabled}>
                    <SelectTrigger id={id}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(["minutes", "hour", "day"] as const).map((t) => <SelectItem key={t} value={t}>{copy.messenger[`replyTime_${t}`]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
              </Field>
              <Field label={copy.messenger.launcherPosition}>
                {() => (
                  <Tabs value={s.launcherPosition} onValueChange={(v) => !disabled && form.set("launcherPosition", v as "left" | "right")}>
                    <TabsList className="w-full">
                      <TabsTrigger value="left" className="flex-1" disabled={disabled}>{copy.messenger.left}</TabsTrigger>
                      <TabsTrigger value="right" className="flex-1" disabled={disabled}>{copy.messenger.right}</TabsTrigger>
                    </TabsList>
                  </Tabs>
                )}
              </Field>
            </div>
            <ToggleRow label={copy.messenger.allowAnonymous} hint={copy.messenger.allowAnonymousHint} checked={s.allowAnonymous} disabled={disabled} onChange={(v) => form.set("allowAnonymous", v)} />
            <ToggleRow label={copy.messenger.askEmail} hint={copy.messenger.askEmailHint} checked={s.askEmailForAnonymous} disabled={disabled || !s.allowAnonymous} onChange={(v) => form.set("askEmailForAnonymous", v)} />
          </SettingsCard>
        </div>
        <MessengerPreview settings={s} lang={lang} />
      </div>
      <SaveBar dirty={form.dirty && validColor} saving={form.saving} onSave={form.save} onDiscard={form.discard} />
    </SettingsPage>
  );
}

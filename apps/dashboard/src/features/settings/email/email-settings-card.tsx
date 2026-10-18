import type { EmailChannelSettings, EmailProviderSetting } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { SettingsCard } from "../settings-page";
import { ToggleRow } from "../assistant/toggle-row";
import type { EmailForm } from "./use-email-form";

const PROVIDERS: EmailProviderSetting[] = ["auto", "cloudflare", "resend"];

export function EmailSettingsCard({ form, saved, disabled }: { form: EmailForm; saved: EmailChannelSettings; disabled: boolean }) {
  const { settings } = useBootstrap();
  const { value: s, errors } = form;
  return (
    <SettingsCard title={copy.emailChannel.settingsTitle}>
      <ToggleRow label={copy.emailChannel.enabled} hint={copy.emailChannel.enabledHint} checked={s.enabled} disabled={disabled} onChange={(v) => form.set("enabled", v)} />
      <Field label={copy.emailChannel.inbound} hint={saved.inboundAddressFromEnv ? copy.emailChannel.inboundFromEnv : copy.emailChannel.inboundHint} error={errors.inboundAddress}>
        {(id) => (
          <Input
            id={id}
            type="email"
            value={s.inboundAddress}
            maxLength={254}
            placeholder={copy.emailChannel.inboundPlaceholder}
            disabled={disabled || saved.inboundAddressFromEnv}
            onChange={(e) => form.set("inboundAddress", e.target.value)}
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={copy.emailChannel.fromName} hint={fmt(copy.emailChannel.fromNameHint, { name: s.fromName.trim() || settings.teamName })}>
          {(id) => <Input id={id} value={s.fromName} maxLength={60} placeholder={settings.teamName} disabled={disabled} onChange={(e) => form.set("fromName", e.target.value)} />}
        </Field>
        <Field label={copy.emailChannel.fromAddress} hint={copy.emailChannel.fromAddressHint} error={errors.fromAddress}>
          {(id) => (
            <Input
              id={id}
              type="email"
              value={s.fromAddress}
              maxLength={254}
              placeholder={saved.status.effectiveFromAddress ?? copy.emailChannel.fromAddressPlaceholder}
              disabled={disabled}
              onChange={(e) => form.set("fromAddress", e.target.value)}
            />
          )}
        </Field>
      </div>
      <Field label={copy.emailChannel.provider}>
        {(id) => (
          <Select value={s.provider} onValueChange={(v) => form.set("provider", v as EmailProviderSetting)} disabled={disabled}>
            <SelectTrigger id={id}><SelectValue /></SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => <SelectItem key={p} value={p}>{copy.emailChannel[`provider_${p}`]}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </Field>
    </SettingsCard>
  );
}

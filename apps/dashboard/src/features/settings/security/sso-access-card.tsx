import { copy } from "@/lib/copy";
import { Field } from "@/components/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleRow } from "../assistant/toggle-row";
import { SettingsCard } from "../settings-page";
import { DomainsEditor } from "./domains-editor";
import type { SsoForm } from "./use-sso-form";

const NEW_PEOPLE = ["invite", "agent", "viewer"] as const;
type NewPeople = (typeof NEW_PEOPLE)[number];

/** Who may sign in with SSO, and whether passwords still work. */
export function SsoAccessCard({ form }: { form: SsoForm }) {
  const { value } = form;
  const newPeople: NewPeople = value.createRole ?? "invite";
  return (
    <SettingsCard title={copy.security.access}>
      <ToggleRow label={copy.security.enabled} hint={copy.security.enabledHint} checked={value.enabled} disabled={false} onChange={(v) => form.set("enabled", v)} />
      <ToggleRow label={copy.security.require} hint={copy.security.requireHint} checked={value.requireSso} disabled={!value.enabled} onChange={(v) => form.set("requireSso", v)} />
      <Field label={copy.security.domains} hint={copy.security.domainsHint}>
        {() => <DomainsEditor domains={value.allowedDomains} onChange={(next) => form.set("allowedDomains", next)} />}
      </Field>
      <Field label={copy.security.newPeople} hint={copy.security.newPeopleHint}>
        {(id) => (
          <Select value={newPeople} onValueChange={(v) => form.set("createRole", v === "invite" ? null : (v as "agent" | "viewer"))}>
            <SelectTrigger id={id} className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NEW_PEOPLE.map((option) => (
                <SelectItem key={option} value={option}>{copy.security[`newPeople_${option}`]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
    </SettingsCard>
  );
}

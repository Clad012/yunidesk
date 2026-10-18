import { businessHoursProblem, type BusinessHours } from "yunidesk";
import { copy } from "@/lib/copy";
import { Field } from "@/components/field";
import { SaveBar, SettingsCard, SettingsPage } from "../settings-page";
import { ToggleRow } from "../assistant/toggle-row";
import { useSettingsForm } from "../use-settings-form";
import { AwayMessageCard } from "./away-message-card";
import { HolidaysEditor } from "./holidays-editor";
import { browserTimeZone } from "./hours-edit";
import { OpenStatus } from "./open-status";
import { TimezonePicker } from "./timezone-picker";
import { WeekEditor } from "./week-editor";

const KEYS = ["businessHours", "awayMessage"] as const;

export function BusinessHoursSection() {
  const form = useSettingsForm(KEYS);
  const { value, canEdit: isOwner } = form;
  const hours = value.businessHours;
  const disabled = !isOwner;
  const problem = businessHoursProblem(hours);
  const setHours = (next: BusinessHours) => form.set("businessHours", next);
  // First time on: start from the browser's zone rather than the UTC placeholder.
  const toggle = (enabled: boolean) =>
    setHours({ ...hours, enabled, timezone: enabled && !hours.enabled && hours.timezone === "UTC" ? browserTimeZone() : hours.timezone });

  return (
    <SettingsPage title={copy.businessHours.title} subtitle={copy.businessHours.subtitle} ownerOnly={!isOwner}>
      <SettingsCard>
        <ToggleRow label={copy.businessHours.enabled} hint={copy.businessHours.enabledHint} checked={hours.enabled} disabled={disabled} onChange={toggle} />
        {hours.enabled ? (
          <>
            <Field label={copy.businessHours.timezone} hint={copy.businessHours.timezoneHint}>
              {(id) => <TimezonePicker id={id} value={hours.timezone} disabled={disabled} onChange={(timezone) => setHours({ ...hours, timezone })} />}
            </Field>
            {problem ? <p className="text-sm text-destructive" role="alert">{problem}</p> : <OpenStatus hours={hours} />}
          </>
        ) : null}
      </SettingsCard>
      {hours.enabled ? (
        <>
          <WeekEditor hours={hours} disabled={disabled} onChange={setHours} />
          <HolidaysEditor hours={hours} disabled={disabled} onChange={setHours} />
          <AwayMessageCard value={value.awayMessage} disabled={disabled} onChange={(next) => form.set("awayMessage", next)} />
        </>
      ) : null}
      <SaveBar dirty={form.dirty && !problem} saving={form.saving} onSave={form.save} onDiscard={form.discard} />
    </SettingsPage>
  );
}

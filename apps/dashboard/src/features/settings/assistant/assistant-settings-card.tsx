import { ExternalLinkIcon, TriangleAlertIcon } from "lucide-react";
import { copy } from "@/lib/copy";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SettingsCard } from "../settings-page";
import { MIN_DAILY_BUDGET_USD } from "./assistant-form-rules";
import { ToggleRow } from "./toggle-row";
import type { AssistantForm } from "./use-assistant-form";

const MODELS_URL = "https://openrouter.ai/models";

export function AssistantSettingsCard({ form, disabled }: { form: AssistantForm; disabled: boolean }) {
  const { value: s, errors } = form;
  return (
    <SettingsCard title={copy.assistant.settingsTitle}>
      <ToggleRow label={copy.assistant.enabled} hint={copy.assistant.enabledHint} checked={s.enabled} disabled={disabled} onChange={(v) => form.set("enabled", v)} />
      {s.enabled && !s.hasOpenRouterKey ? (
        <p className="flex items-center gap-1.5 rounded-lg bg-note px-2.5 py-1.5 text-xs text-note-foreground">
          <TriangleAlertIcon className="size-3.5 shrink-0" /> {copy.assistant.noKeyWarning}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={copy.assistant.name} hint={copy.assistant.nameHint} error={errors.name}>
          {(id) => <Input id={id} value={s.name} maxLength={60} placeholder={copy.assistant.namePlaceholder} disabled={disabled} onChange={(e) => form.set("name", e.target.value)} />}
        </Field>
        <Field
          label={copy.assistant.model}
          error={errors.model}
          hint={
            <>
              {copy.assistant.modelHint}{" "}
              <a href={MODELS_URL} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-0.5 text-primary underline-offset-2 hover:underline">
                {copy.assistant.modelsLink} <ExternalLinkIcon className="size-3" />
              </a>
            </>
          }
        >
          {(id) => <Input id={id} value={s.model} maxLength={120} placeholder={copy.assistant.modelPlaceholder} disabled={disabled} onChange={(e) => form.set("model", e.target.value.trim())} className="font-mono text-xs" />}
        </Field>
      </div>
      <Field label={copy.assistant.instructions} hint={copy.assistant.instructionsHint}>
        {(id) => (
          <Textarea id={id} rows={6} maxLength={4000} value={s.instructions} placeholder={copy.assistant.instructionsPlaceholder} disabled={disabled} onChange={(e) => form.set("instructions", e.target.value)} />
        )}
      </Field>
      <Field label={copy.assistant.budget} hint={copy.assistant.budgetHint} error={errors.dailyBudgetUsd}>
        {(id) => (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">$</span>
            <Input
              id={id}
              type="number"
              min={MIN_DAILY_BUDGET_USD}
              step={0.5}
              value={Number.isFinite(s.dailyBudgetUsd) ? s.dailyBudgetUsd : ""}
              disabled={disabled}
              onChange={(e) => form.set("dailyBudgetUsd", e.target.valueAsNumber)}
              className="w-28 tabular-nums"
            />
            <span className="text-sm text-muted-foreground">{copy.assistant.budgetUnit}</span>
          </div>
        )}
      </Field>
      <ToggleRow label={copy.assistant.allowAnonymous} hint={copy.assistant.allowAnonymousHint} checked={s.allowAnonymous} disabled={disabled} onChange={(v) => form.set("allowAnonymous", v)} />
    </SettingsCard>
  );
}

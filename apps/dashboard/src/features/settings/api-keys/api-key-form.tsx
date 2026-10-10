import { API_SCOPES, type ApiScope } from "yunidesk";
import { useState, type FormEvent } from "react";
import { copy } from "@/lib/copy";
import type { CreateApiKeyInput } from "@/lib/endpoints";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DialogFooter } from "@/components/ui/dialog";

const EXPIRY = [
  { value: "30", days: 30, label: copy.apiKeys.expiry_30 },
  { value: "90", days: 90, label: copy.apiKeys.expiry_90 },
  { value: "365", days: 365, label: copy.apiKeys.expiry_365 },
  { value: "never", days: null, label: copy.apiKeys.expiry_never },
] as const;
type ExpiryValue = (typeof EXPIRY)[number]["value"];

interface ApiKeyFormProps {
  pending: boolean;
  error: string | null;
  onCancel: () => void;
  onSubmit: (input: CreateApiKeyInput) => void;
}

export function ApiKeyForm({ pending, error, onCancel, onSubmit }: ApiKeyFormProps) {
  const [name, setName] = useState("");
  const [botName, setBotName] = useState("");
  const [scopes, setScopes] = useState<ApiScope[]>(["conversations:read"]);
  const [expiry, setExpiry] = useState<ExpiryValue>("365");
  const toggle = (scope: ApiScope, on: boolean) => setScopes((s) => (on ? [...s, scope] : s.filter((x) => x !== scope)));
  const valid = name.trim() !== "" && scopes.length > 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    const days = EXPIRY.find((e) => e.value === expiry)?.days ?? null;
    onSubmit({ name: name.trim(), botName: botName.trim() || undefined, scopes: API_SCOPES.filter((s) => scopes.includes(s)), expiresInDays: days });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={copy.apiKeys.name} hint={copy.apiKeys.nameHint}>
          {(id) => <Input id={id} required autoFocus maxLength={60} value={name} placeholder={copy.apiKeys.namePlaceholder} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label={copy.apiKeys.replyName} hint={copy.apiKeys.replyNameHint}>
          {(id) => <Input id={id} maxLength={60} value={botName} placeholder={name.trim() || copy.apiKeys.namePlaceholder} onChange={(e) => setBotName(e.target.value)} />}
        </Field>
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">{copy.apiKeys.scopes}</legend>
        {API_SCOPES.map((scope) => (
          <Label key={scope} className="flex cursor-pointer items-start gap-2.5 rounded-lg bg-muted/50 px-3 py-2.5 font-normal">
            <Checkbox checked={scopes.includes(scope)} onCheckedChange={(on) => toggle(scope, on === true)} className="mt-0.5" />
            <span className="flex flex-col gap-0.5">
              <code className="text-xs font-medium">{scope}</code>
              <span className="text-sm text-muted-foreground">{copy.apiKeys.scopeLabels[scope]}</span>
            </span>
          </Label>
        ))}
        {scopes.length === 0 ? <p className="text-xs text-destructive">{copy.apiKeys.pickScope}</p> : null}
      </fieldset>
      <Field label={copy.apiKeys.expiry} className="sm:max-w-56">
        {(id) => (
          <Select value={expiry} onValueChange={(v) => setExpiry(v as ExpiryValue)}>
            <SelectTrigger id={id}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {EXPIRY.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {copy.common.cancel}
        </Button>
        <Button type="submit" disabled={pending || !valid}>
          {pending ? copy.apiKeys.creating : copy.apiKeys.create}
        </Button>
      </DialogFooter>
    </form>
  );
}

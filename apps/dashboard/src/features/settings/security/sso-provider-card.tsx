import { useMutation } from "@tanstack/react-query";
import { CheckCircle2Icon } from "lucide-react";
import { copy, fmt } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CopyButton } from "../code-block";
import { SettingsCard } from "../settings-page";
import type { SsoForm } from "./use-sso-form";

/** Where the provider sends people back, and how we reach the provider. */
export function SsoProviderCard({ form }: { form: SsoForm }) {
  const { value } = form;
  const test = useMutation({ mutationFn: () => endpoints.testSso(value.issuer.trim()) });
  const testMessage = test.isSuccess
    ? fmt(copy.security.testOk, { issuer: test.data.issuer })
    : test.isError
      ? errorMessage(test.error, copy.common.somethingWrong)
      : null;

  return (
    <SettingsCard title={copy.security.provider}>
      <Field label={copy.security.callbackUrl} hint={copy.security.callbackHint}>
        {(id) => (
          <div className="flex items-center gap-2">
            <Input id={id} readOnly value={value.callbackUrl} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            <CopyButton text={value.callbackUrl} className="h-9" />
          </div>
        )}
      </Field>
      <Field label={copy.security.issuer} hint={copy.security.issuerHint}>
        {(id) => (
          <div className="flex items-center gap-2">
            <Input id={id} type="url" value={value.issuer} placeholder="https://" onChange={(e) => (test.reset(), form.set("issuer", e.target.value.trim()))} className="font-mono text-xs" />
            <Button type="button" variant="outline" onClick={() => test.mutate()} disabled={!value.issuer || test.isPending}>
              {test.isPending ? copy.security.testing : copy.security.test}
            </Button>
          </div>
        )}
      </Field>
      {testMessage ? (
        <p className={test.isSuccess ? "flex items-center gap-1.5 text-xs text-success" : "text-xs text-destructive"}>
          {test.isSuccess ? <CheckCircle2Icon className="size-3.5" /> : null}
          {testMessage}
        </p>
      ) : null}
      <Field label={copy.security.clientId}>
        {(id) => <Input id={id} value={value.clientId} autoComplete="off" onChange={(e) => form.set("clientId", e.target.value.trim())} className="font-mono text-xs" />}
      </Field>
      <Field label={copy.security.clientSecret} hint={value.hasClientSecret ? copy.security.clientSecretSet : copy.security.clientSecretHint}>
        {(id) => (
          <Input id={id} type="password" autoComplete="new-password" value={form.secretDraft} placeholder={value.hasClientSecret ? "••••••••" : ""} onChange={(e) => form.set("clientSecret", e.target.value)} />
        )}
      </Field>
    </SettingsCard>
  );
}

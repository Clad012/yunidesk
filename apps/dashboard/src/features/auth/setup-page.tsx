import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/field";
import { AuthLayout } from "./auth-layout";
import { useSignedIn } from "./use-signed-in";

export function SetupPage() {
  const [form, setForm] = useState({ setupToken: "", name: "", email: "", password: "" });
  const signedIn = useSignedIn();
  const setup = useMutation({ mutationFn: endpoints.setup, onSuccess: signedIn });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const tooShort = form.password.length > 0 && form.password.length < 10;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (form.password.length >= 10) setup.mutate(form);
  };

  return (
    <AuthLayout title={copy.auth.setupTitle} subtitle={copy.auth.setupSubtitle}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={copy.auth.setupToken}>
          {(id) => <Input id={id} required autoFocus autoComplete="off" value={form.setupToken} onChange={set("setupToken")} />}
        </Field>
        <Field label={copy.auth.name}>{(id) => <Input id={id} required autoComplete="name" value={form.name} onChange={set("name")} />}</Field>
        <Field label={copy.auth.email}>
          {(id) => <Input id={id} type="email" required autoComplete="email" value={form.email} onChange={set("email")} />}
        </Field>
        <Field label={copy.auth.password} hint={copy.auth.passwordHint} error={tooShort ? copy.auth.passwordTooShort : null}>
          {(id) => <Input id={id} type="password" required autoComplete="new-password" value={form.password} onChange={set("password")} />}
        </Field>
        {setup.error ? <p className="text-sm text-destructive">{errorMessage(setup.error, copy.common.somethingWrong)}</p> : null}
        <Button type="submit" className="mt-1 w-full" disabled={setup.isPending}>
          {copy.auth.createAccount}
        </Button>
      </form>
    </AuthLayout>
  );
}

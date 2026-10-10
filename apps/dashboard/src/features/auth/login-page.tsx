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

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const signedIn = useSignedIn();
  const login = useMutation({ mutationFn: endpoints.login, onSuccess: signedIn });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <AuthLayout title={copy.auth.loginTitle} subtitle={copy.auth.loginSubtitle}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={copy.auth.email}>
          {(id) => <Input id={id} type="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />}
        </Field>
        <Field label={copy.auth.password} error={login.error ? errorMessage(login.error, copy.common.somethingWrong) : null}>
          {(id) => (
            <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          )}
        </Field>
        <Button type="submit" className="mt-1 w-full" disabled={login.isPending}>
          {login.isPending ? copy.auth.signingIn : copy.auth.signIn}
        </Button>
      </form>
    </AuthLayout>
  );
}

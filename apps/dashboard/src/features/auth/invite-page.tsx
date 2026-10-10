import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { copy, fmt } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Field } from "@/components/field";
import { AuthLayout } from "./auth-layout";
import { useSignedIn } from "./use-signed-in";

export function InvitePage() {
  const { token } = useParams({ from: "/invite/$token" });
  const invite = useQuery({ queryKey: ["invite", token], queryFn: () => endpoints.invite(token), retry: false });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const signedIn = useSignedIn();
  const accept = useMutation({ mutationFn: () => endpoints.acceptInvite(token, { name, password }), onSuccess: signedIn });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (password.length >= 10) accept.mutate();
  };

  if (invite.isError) {
    return (
      <AuthLayout title={copy.common.somethingWrong}>
        <p className="text-sm text-muted-foreground">{copy.auth.inviteInvalid}</p>
        <Button asChild variant="outline" className="mt-4 w-full">
          <Link to="/login">{copy.auth.backToLogin}</Link>
        </Button>
      </AuthLayout>
    );
  }

  const role = invite.data?.role === "owner" ? copy.team.owner.toLowerCase() : copy.team.agent.toLowerCase();
  return (
    <AuthLayout
      title={fmt(copy.auth.inviteTitle, { team: copy.appName })}
      subtitle={invite.data ? fmt(copy.auth.inviteSubtitle, { role, email: invite.data.email }) : <Skeleton className="mx-auto h-4 w-48" />}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={copy.auth.name}>{(id) => <Input id={id} required autoFocus autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field
          label={copy.auth.password}
          hint={copy.auth.passwordHint}
          error={password && password.length < 10 ? copy.auth.passwordTooShort : accept.error ? errorMessage(accept.error, copy.common.somethingWrong) : null}
        >
          {(id) => <Input id={id} type="password" required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
        <Button type="submit" className="mt-1 w-full" disabled={accept.isPending || !invite.data}>
          {copy.auth.acceptInvite}
        </Button>
      </form>
    </AuthLayout>
  );
}

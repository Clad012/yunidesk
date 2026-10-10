import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints } from "@/lib/endpoints";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const change = useMutation({
    mutationFn: () => endpoints.updateMe({ currentPassword: current, newPassword: next }),
    onSuccess: () => {
      setCurrent("");
      setNext("");
      toast.success(copy.profile.passwordChanged);
    },
  });
  const tooShort = next.length > 0 && next.length < 10;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (current && next.length >= 10) change.mutate();
  };

  return (
    <form onSubmit={submit} className="flex max-w-sm flex-col gap-4">
      <Field label={copy.profile.currentPassword}>{(id) => <Input id={id} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />}</Field>
      <Field label={copy.profile.newPassword} hint={copy.auth.passwordHint} error={tooShort ? copy.auth.passwordTooShort : change.error ? errorMessage(change.error, copy.common.somethingWrong) : null}>
        {(id) => <Input id={id} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />}
      </Field>
      <div>
        <Button type="submit" disabled={change.isPending || !current || next.length < 10}>{copy.profile.changePassword}</Button>
      </div>
    </form>
  );
}

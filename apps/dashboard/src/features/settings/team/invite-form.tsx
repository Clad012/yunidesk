import type { AgentRole } from "yunidesk";
import { useState, type FormEvent } from "react";
import { copy, fmt } from "@/lib/copy";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CopyButton } from "../code-block";
import type { useTeam } from "./use-team";

export function InviteForm({ invite }: { invite: ReturnType<typeof useTeam>["invite"] }) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AgentRole>("agent");
  const [link, setLink] = useState<{ url: string; email: string } | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    invite.mutate({ email: email.trim(), role }, { onSuccess: (r) => (setLink({ url: r.url, email: email.trim() }), setEmail("")) });
  };

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <Field label={copy.team.inviteEmail} className="min-w-56 flex-1">
          {(id) => <Input id={id} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder={copy.team.invitePlaceholder} />}
        </Field>
        <Field label={copy.team.inviteRole} className="w-36">
          {(id) => (
            <Select value={role} onValueChange={(v) => setRole(v as AgentRole)}>
              <SelectTrigger id={id}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">{copy.team.agent}</SelectItem>
                <SelectItem value="owner">{copy.team.owner}</SelectItem>
              </SelectContent>
            </Select>
          )}
        </Field>
        <Button type="submit" disabled={invite.isPending}>{copy.team.sendInvite}</Button>
      </form>
      {link ? (
        <div className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <p className="text-sm font-medium">{copy.team.inviteLink}</p>
          <div className="flex items-center gap-2">
            <Input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            <CopyButton text={link.url} className="h-9" />
          </div>
          <p className="text-xs text-muted-foreground">{fmt(copy.team.inviteLinkHint, { email: link.email })}</p>
        </div>
      ) : null}
    </div>
  );
}

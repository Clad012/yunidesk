import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UploadIcon } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { Agent } from "yunidesk";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys, type Bootstrap } from "@/lib/endpoints";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { Field } from "@/components/field";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsCard, SettingsPage } from "../settings-page";
import { PasswordForm } from "./password-form";

export function ProfileSection() {
  const { agent } = useBootstrap();
  const qc = useQueryClient();
  const [name, setName] = useState(agent.name);
  const file = useRef<HTMLInputElement>(null);
  const setAgent = (next: Agent) => qc.setQueryData<Bootstrap>(queryKeys.bootstrap, (b) => (b ? { ...b, agent: next, teammates: b.teammates.map((t) => (t.id === next.id ? { id: next.id, name: next.name, avatarUrl: next.avatarUrl } : t)) } : b));
  const onError = (e: Error) => toast.error(errorMessage(e, copy.common.somethingWrong));

  const rename = useMutation({ mutationFn: () => endpoints.updateMe({ name: name.trim() }), onSuccess: (r) => (setAgent(r.agent), toast.success(copy.profile.updated)), onError });
  const avatar = useMutation({
    mutationFn: (f: File) => {
      const form = new FormData();
      form.append("file", f);
      return endpoints.uploadAvatar(form);
    },
    onSuccess: (r) => (setAgent(r.agent), toast.success(copy.profile.updated)),
    onError,
  });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name.trim() && name.trim() !== agent.name) rename.mutate();
  };

  return (
    <SettingsPage title={copy.profile.title} subtitle={copy.profile.subtitle}>
      <SettingsCard title={copy.profile.avatar} description={copy.profile.avatarHint}>
        <div className="flex items-center gap-4">
          <PersonAvatar name={agent.name} avatarUrl={agent.avatarUrl} seed={agent.id} className="size-16 text-lg" />
          <input ref={file} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => { const f = e.target.files?.[0]; if (f) avatar.mutate(f); e.target.value = ""; }} />
          <Button variant="outline" onClick={() => file.current?.click()} disabled={avatar.isPending}>
            <UploadIcon /> {avatar.isPending ? copy.composer.uploading : copy.profile.uploadAvatar}
          </Button>
        </div>
      </SettingsCard>
      <SettingsCard>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label={copy.profile.name}>{(id) => <Input id={id} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="max-w-sm" />}</Field>
          <Field label={copy.profile.email}>{(id) => <Input id={id} value={agent.email} readOnly disabled className="max-w-sm" />}</Field>
          <div>
            <Button type="submit" disabled={rename.isPending || !name.trim() || name.trim() === agent.name}>{copy.common.save}</Button>
          </div>
        </form>
      </SettingsCard>
      <SettingsCard title={copy.profile.password}>
        <PasswordForm />
      </SettingsCard>
    </SettingsPage>
  );
}

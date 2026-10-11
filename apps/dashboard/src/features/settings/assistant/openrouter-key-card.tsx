import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleCheckIcon, CircleDashedIcon } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import type { AssistantSettings } from "yunidesk";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys } from "@/lib/endpoints";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "../confirm-dialog";
import { SettingsCard } from "../settings-page";

export function OpenRouterKeyCard({ hasKey, disabled }: { hasKey: boolean; disabled: boolean }) {
  const qc = useQueryClient();
  const [key, setKey] = useState("");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const onSaved = (next: AssistantSettings, message: string) => {
    qc.setQueryData(queryKeys.assistant, next);
    toast.success(message);
  };
  const onError = (error: unknown) => toast.error(errorMessage(error, copy.common.somethingWrong));
  const save = useMutation({
    mutationFn: endpoints.setOpenRouterKey,
    // Drop the sent key from the mutation cache too, not only from the input.
    gcTime: 0,
    onSuccess: (next) => onSaved(next, copy.assistant.keySaved),
    onError,
  });
  const remove = useMutation({ mutationFn: endpoints.removeOpenRouterKey, onSuccess: (next) => onSaved(next, copy.assistant.keyRemoved), onError });

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) return;
    // The key leaves the browser's memory as soon as it's sent; a failed save means pasting it again.
    setKey("");
    save.mutate(trimmed, { onSettled: () => save.reset() });
  };

  return (
    <SettingsCard title={copy.assistant.keyTitle} description={copy.assistant.keyDescription}>
      <Badge variant={hasKey ? "success" : "secondary"}>
        {hasKey ? <CircleCheckIcon /> : <CircleDashedIcon />}
        {hasKey ? copy.assistant.keySet : copy.assistant.noKey}
      </Badge>
      {disabled ? null : (
        <form onSubmit={submit} className="flex flex-col gap-2">
          <Input
            type="password"
            autoComplete="off"
            spellCheck={false}
            aria-label={copy.assistant.keyLabel}
            value={key}
            placeholder={hasKey ? copy.assistant.keyReplacePlaceholder : copy.assistant.keyPlaceholder}
            onChange={(e) => setKey(e.target.value)}
            className="font-mono text-xs"
          />
          <div className="flex gap-2">
            <Button type="submit" disabled={!key.trim() || save.isPending}>
              {save.isPending ? copy.common.saving : copy.assistant.saveKey}
            </Button>
            {hasKey ? (
              <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" disabled={remove.isPending} onClick={() => setConfirmRemove(true)}>
                {copy.assistant.removeKey}
              </Button>
            ) : null}
          </div>
        </form>
      )}
      <ConfirmDialog
        open={confirmRemove}
        title={copy.assistant.removeKeyTitle}
        body={copy.assistant.removeKeyBody}
        action={copy.assistant.removeKey}
        destructive
        onOpenChange={setConfirmRemove}
        onConfirm={() => remove.mutate()}
      />
    </SettingsCard>
  );
}

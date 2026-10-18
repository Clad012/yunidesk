import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CannedResponse } from "yunidesk";
import { PencilIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys } from "@/lib/endpoints";
import { useCan } from "@/hooks/use-bootstrap";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SettingsCard, SettingsPage } from "../settings-page";
import { CannedDialog, type CannedDraft } from "./canned-dialog";
import { DeleteCannedButton } from "./delete-canned-button";

export function SavedRepliesSection() {
  const qc = useQueryClient();
  const canManage = useCan("savedReplies.manage");
  const canned = useQuery({ queryKey: queryKeys.canned, queryFn: endpoints.canned });
  const [editing, setEditing] = useState<CannedResponse | null | "new">(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: queryKeys.canned });

  const save = useMutation({
    mutationFn: (draft: CannedDraft) => (editing && editing !== "new" ? endpoints.updateCanned(editing.id, draft) : endpoints.createCanned(draft)),
    onSuccess: () => {
      toast.success(editing === "new" ? copy.canned.created : copy.canned.updated);
      setEditing(null);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: endpoints.deleteCanned,
    onSuccess: () => (toast.success(copy.canned.deleted), refresh()),
    onError: (e) => toast.error(errorMessage(e, copy.common.somethingWrong)),
  });
  const items = canned.data?.items ?? [];

  return (
    <SettingsPage title={copy.canned.title} subtitle={copy.canned.subtitle} ownerOnly={!canManage}>
      {canManage ? (
        <div>
          <Button onClick={() => (save.reset(), setEditing("new"))}>
            <PlusIcon /> {copy.canned.new}
          </Button>
        </div>
      ) : null}
      <SettingsCard>
        {canned.isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : items.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{copy.canned.empty}</p>
        ) : (
          <ul className="-my-3 divide-y">
            {items.map((item) => (
              <li key={item.id} className="group flex items-start gap-3 py-3">
                <code className="mt-0.5 shrink-0 rounded-md bg-primary/10 px-1.5 py-0.5 text-xs text-primary">/{item.shortcut}</code>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="line-clamp-2 text-sm whitespace-pre-wrap text-muted-foreground">{item.body}</p>
                </div>
                {canManage ? (
                  <>
                    <Button size="icon-xs" variant="ghost" aria-label={copy.common.edit} onClick={() => (save.reset(), setEditing(item))}>
                      <PencilIcon />
                    </Button>
                    <DeleteCannedButton title={item.title} onConfirm={() => remove.mutate(item.id)} />
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </SettingsCard>
      {editing ? (
        <CannedDialog
          key={editing === "new" ? "new" : editing.id}
          open
          initial={editing === "new" ? null : editing}
          saving={save.isPending}
          error={save.error ? errorMessage(save.error, copy.common.somethingWrong) : null}
          onOpenChange={(open) => !open && setEditing(null)}
          onSave={(draft) => save.mutate(draft)}
        />
      ) : null}
    </SettingsPage>
  );
}

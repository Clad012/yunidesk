import { ChevronDownIcon, ChevronUpIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import type { ConversationField } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import type { ConversationFieldInput } from "@/lib/endpoints";
import { useCan } from "@/hooks/use-bootstrap";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversationFields } from "@/features/tags/use-tags";
import { ConfirmDialog } from "../confirm-dialog";
import { SettingsCard } from "../settings-page";
import { FieldDialog } from "./field-dialog";
import { useFieldMutations } from "./use-tags-fields";

export function FieldsCard() {
  const owner = useCan("settings.manage");
  const fields = useConversationFields();
  const { create, update, remove, reorder } = useFieldMutations();
  const [editing, setEditing] = useState<ConversationField | "new" | null>(null);
  const [deleting, setDeleting] = useState<ConversationField | null>(null);
  const items = fields.data?.items ?? [];
  const save = editing === "new" ? create : update;

  const onSave = (draft: ConversationFieldInput) => {
    const done = { onSuccess: () => setEditing(null) };
    if (editing === "new") create.mutate(draft, done);
    else if (editing) update.mutate({ id: editing.id, label: draft.label, ...(draft.options ? { options: draft.options } : {}) }, done);
  };
  const move = (index: number, delta: number) => {
    const ids = items.map((f) => f.id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + delta, 0, moved!);
    reorder.mutate(ids);
  };

  return (
    <SettingsCard title={copy.tagsFields.fieldsTitle} description={copy.tagsFields.fieldsHint}>
      {owner ? (
        <div>
          <Button size="sm" variant="outline" onClick={() => (create.reset(), setEditing("new"))}>
            <PlusIcon /> {copy.tagsFields.newField}
          </Button>
        </div>
      ) : null}
      {fields.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : fields.isError ? (
        <p className="text-sm text-destructive">{copy.common.somethingWrong}</p>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{copy.tagsFields.noFields}</p>
      ) : (
        <ul className="-my-2 divide-y">
          {items.map((field, index) => (
            <li key={field.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{field.label}</p>
                <p className="truncate text-xs text-muted-foreground">
                  <code>{field.key}</code> · {copy.tagsFields[`type_${field.type}`]}
                  {field.type === "select" ? ` · ${field.options.join(", ")}` : ""}
                </p>
              </div>
              {owner ? (
                <>
                  <Button size="icon-xs" variant="ghost" aria-label={copy.tagsFields.moveUp} disabled={index === 0 || reorder.isPending} onClick={() => move(index, -1)}>
                    <ChevronUpIcon />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label={copy.tagsFields.moveDown} disabled={index === items.length - 1 || reorder.isPending} onClick={() => move(index, 1)}>
                    <ChevronDownIcon />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label={copy.tagsFields.editField} onClick={() => (update.reset(), setEditing(field))}>
                    <PencilIcon />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label={copy.common.delete} className="text-destructive hover:text-destructive" onClick={() => setDeleting(field)}>
                    <Trash2Icon />
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <FieldDialog
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          saving={save.isPending}
          error={save.error ? errorMessage(save.error, copy.common.somethingWrong) : null}
          onOpenChange={(open) => !open && setEditing(null)}
          onSave={onSave}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title={copy.tagsFields.deleteFieldTitle}
        body={deleting ? fmt(copy.tagsFields.deleteFieldBody, { label: deleting.label }) : ""}
        action={copy.common.delete}
        destructive
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </SettingsCard>
  );
}

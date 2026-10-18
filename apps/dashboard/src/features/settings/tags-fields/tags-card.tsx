import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import type { TagWithUsage } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { useCan } from "@/hooks/use-bootstrap";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TagChip } from "@/features/tags/tag-chip";
import { useTags } from "@/features/tags/use-tags";
import { ConfirmDialog } from "../confirm-dialog";
import { SettingsCard } from "../settings-page";
import { TagDialog, type TagDraft } from "./tag-dialog";
import { useTagMutations } from "./use-tags-fields";

const usage = (tag: TagWithUsage) =>
  fmt(tag.conversationCount === 1 ? copy.tagsFields.usageOne : copy.tagsFields.usage, { n: tag.conversationCount, open: tag.openCount });

export function TagsCard() {
  const owner = useCan("settings.manage");
  const tags = useTags();
  const { create, update, remove } = useTagMutations();
  const [editing, setEditing] = useState<TagWithUsage | "new" | null>(null);
  const [deleting, setDeleting] = useState<TagWithUsage | null>(null);
  const items = tags.data?.items ?? [];
  const save = editing === "new" ? create : update;

  const onSave = (draft: TagDraft) => {
    const done = { onSuccess: () => setEditing(null) };
    if (editing === "new") create.mutate(draft, done);
    else if (editing) update.mutate({ id: editing.id, ...draft }, done);
  };

  return (
    <SettingsCard title={copy.tagsFields.tagsTitle} description={copy.tagsFields.tagsHint}>
      <div>
        <Button size="sm" variant="outline" onClick={() => (create.reset(), setEditing("new"))}>
          <PlusIcon /> {copy.tagsFields.newTag}
        </Button>
      </div>
      {tags.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : tags.isError ? (
        <p className="text-sm text-destructive">{copy.common.somethingWrong}</p>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{copy.tagsFields.noTags}</p>
      ) : (
        <ul className="-my-2 divide-y">
          {items.map((tag) => (
            <li key={tag.id} className="flex items-center gap-3 py-2">
              <TagChip tag={tag} className="max-w-56" />
              <span className="flex-1 truncate text-xs text-muted-foreground">{usage(tag)}</span>
              {owner ? (
                <>
                  <Button size="icon-xs" variant="ghost" aria-label={copy.tagsFields.editTag} onClick={() => (update.reset(), setEditing(tag))}>
                    <PencilIcon />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label={copy.common.delete} className="text-destructive hover:text-destructive" onClick={() => setDeleting(tag)}>
                    <Trash2Icon />
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <TagDialog
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
        title={copy.tagsFields.deleteTagTitle}
        body={deleting ? fmt(copy.tagsFields.deleteTagBody, { name: deleting.name, n: deleting.conversationCount }) : ""}
        action={copy.common.delete}
        destructive
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </SettingsCard>
  );
}

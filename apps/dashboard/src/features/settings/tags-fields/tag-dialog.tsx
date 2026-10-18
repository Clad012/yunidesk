import { useState, type FormEvent } from "react";
import { MAX_TAG_NAME_LENGTH, type TagColor, type TagWithUsage } from "yunidesk";
import { copy } from "@/lib/copy";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ColorPicker } from "@/features/tags/color-picker";
import { TagChip } from "@/features/tags/tag-chip";

export type TagDraft = { name: string; color: TagColor };

interface TagDialogProps {
  initial: TagWithUsage | null;
  saving: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: TagDraft) => void;
}

export function TagDialog({ initial, saving, error, onOpenChange, onSave }: TagDialogProps) {
  const [draft, setDraft] = useState<TagDraft>(() => ({ name: initial?.name ?? "", color: initial?.color ?? "blue" }));
  const name = draft.name.replace(/\s+/g, " ").trim();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name) onSave({ name, color: draft.color });
  };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{initial ? copy.tagsFields.editTag : copy.tagsFields.newTag}</DialogTitle>
            <DialogDescription>{copy.tagsFields.tagsHint}</DialogDescription>
          </DialogHeader>
          <Field label={copy.tagsFields.tagName} error={error}>
            {(id) => <Input id={id} required autoFocus maxLength={MAX_TAG_NAME_LENGTH} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />}
          </Field>
          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium">{copy.tags.color}</p>
            <ColorPicker value={draft.color} onChange={(color) => setDraft((d) => ({ ...d, color }))} />
          </div>
          {name ? <TagChip tag={{ name, color: draft.color }} className="self-start" /> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{copy.common.cancel}</Button>
            <Button type="submit" disabled={saving || !name}>{saving ? copy.common.saving : copy.common.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

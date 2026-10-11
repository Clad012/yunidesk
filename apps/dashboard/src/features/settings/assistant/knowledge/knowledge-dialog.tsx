import type { KnowledgeInput, KnowledgeItem } from "yunidesk";
import { useState, type FormEvent } from "react";
import { copy } from "@/lib/copy";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Kind = KnowledgeInput["kind"];
const KINDS: readonly Kind[] = ["faq", "article"];

interface KnowledgeDialogProps {
  initial: KnowledgeItem | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (body: KnowledgeInput) => void;
}

export function KnowledgeDialog({ initial, saving, error, onClose, onSave }: KnowledgeDialogProps) {
  const [draft, setDraft] = useState<KnowledgeInput>(() => ({ kind: initial?.kind ?? "faq", title: initial?.title ?? "", body: initial?.body ?? "" }));
  const faq = draft.kind === "faq";
  const complete = draft.title.trim() !== "" && draft.body.trim() !== "";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (complete) onSave({ kind: draft.kind, title: draft.title.trim(), body: draft.body.trim() });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{initial ? copy.knowledge.editTitle : copy.knowledge.newTitle}</DialogTitle>
            <DialogDescription>{copy.knowledge.dialogDescription}</DialogDescription>
          </DialogHeader>
          <Field label={copy.knowledge.kind}>
            {(id) => (
              <Select value={draft.kind} onValueChange={(v) => setDraft((d) => ({ ...d, kind: v as Kind }))}>
                <SelectTrigger id={id} className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {copy.knowledge[`kind_${kind}`]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          <Field label={faq ? copy.knowledge.question : copy.knowledge.articleTitle}>
            {(id) => <Input id={id} required maxLength={200} value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />}
          </Field>
          <Field label={faq ? copy.knowledge.answer : copy.knowledge.content} error={error}>
            {(id) => <Textarea id={id} required maxLength={20000} rows={faq ? 5 : 12} value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} />}
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {copy.common.cancel}
            </Button>
            <Button type="submit" disabled={saving || !complete}>
              {saving ? copy.common.saving : copy.common.save}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

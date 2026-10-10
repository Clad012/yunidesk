import type { CannedResponse } from "yunidesk";
import { useState, type FormEvent } from "react";
import { copy } from "@/lib/copy";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export type CannedDraft = { shortcut: string; title: string; body: string };

interface CannedDialogProps {
  open: boolean;
  initial: CannedResponse | null;
  saving: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: CannedDraft) => void;
}

export function CannedDialog({ open, initial, saving, error, onOpenChange, onSave }: CannedDialogProps) {
  const [draft, setDraft] = useState<CannedDraft>(() => ({ shortcut: initial?.shortcut ?? "", title: initial?.title ?? "", body: initial?.body ?? "" }));
  const validShortcut = /^[\w-]+$/.test(draft.shortcut);
  const set = (key: keyof CannedDraft) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (validShortcut && draft.title.trim() && draft.body.trim()) onSave(draft);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{initial ? copy.common.edit : copy.canned.new}</DialogTitle>
            <DialogDescription>{copy.canned.subtitle}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <Field label={copy.canned.shortcut} error={draft.shortcut && !validShortcut ? copy.canned.shortcutHint : null}>
              {(id) => (
                <div className="flex items-center rounded-lg border border-input bg-card pl-2.5 shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40">
                  <span className="text-sm text-muted-foreground">/</span>
                  <input id={id} required maxLength={40} value={draft.shortcut} onChange={(e) => set("shortcut")(e.target.value)} className="h-9 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none" />
                </div>
              )}
            </Field>
            <Field label={copy.canned.replyTitle}>{(id) => <Input id={id} required maxLength={80} value={draft.title} onChange={(e) => set("title")(e.target.value)} />}</Field>
          </div>
          <Field label={copy.canned.body} error={error}>{(id) => <Textarea id={id} required maxLength={5000} rows={6} value={draft.body} onChange={(e) => set("body")(e.target.value)} />}</Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{copy.common.cancel}</Button>
            <Button type="submit" disabled={saving || !validShortcut}>{saving ? copy.common.saving : copy.common.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

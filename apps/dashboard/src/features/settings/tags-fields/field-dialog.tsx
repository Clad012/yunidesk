import { useState, type FormEvent } from "react";
import { CONVERSATION_FIELD_TYPES, type ConversationField, type ConversationFieldType } from "yunidesk";
import { copy } from "@/lib/copy";
import type { ConversationFieldInput } from "@/lib/endpoints";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FIELD_KEY_PATTERN, fieldKeyFromLabel } from "./field-key";

interface FieldDialogProps {
  initial: ConversationField | null;
  saving: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onSave: (draft: ConversationFieldInput) => void;
}

const toOptions = (text: string) => [...new Set(text.split("\n").map((o) => o.trim()).filter(Boolean))];

/** New field: label, key (suggested from the label), type and choices. Editing: label and choices only. */
export function FieldDialog({ initial, saving, error, onOpenChange, onSave }: FieldDialogProps) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [key, setKey] = useState(initial?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(false);
  const [type, setType] = useState<ConversationFieldType>(initial?.type ?? "text");
  const [options, setOptions] = useState((initial?.options ?? []).join("\n"));
  const effectiveKey = initial ? initial.key : keyTouched ? key : fieldKeyFromLabel(label);
  const validKey = FIELD_KEY_PATTERN.test(effectiveKey);
  const list = toOptions(options);
  const ready = label.trim() && validKey && (type !== "select" || list.length > 0);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (ready) onSave({ key: effectiveKey, label: label.trim(), type, ...(type === "select" ? { options: list } : {}) });
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{initial ? copy.tagsFields.editField : copy.tagsFields.newField}</DialogTitle>
            <DialogDescription>{copy.tagsFields.fieldsHint}</DialogDescription>
          </DialogHeader>
          <Field label={copy.tagsFields.fieldLabel}>
            {(id) => <Input id={id} required autoFocus maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} />}
          </Field>
          <Field label={copy.tagsFields.fieldKey} hint={copy.tagsFields.fieldKeyHint} error={effectiveKey && !validKey ? copy.tagsFields.fieldKeyHint : null}>
            {(id) => (
              <Input
                id={id}
                className="font-mono"
                maxLength={40}
                disabled={Boolean(initial)}
                value={effectiveKey}
                onChange={(e) => (setKeyTouched(true), setKey(e.target.value))}
              />
            )}
          </Field>
          <Field label={copy.tagsFields.fieldType} hint={initial ? copy.tagsFields.fieldTypeFixed : undefined}>
            {(id) => (
              <Select value={type} onValueChange={(v) => setType(v as ConversationFieldType)} disabled={Boolean(initial)}>
                <SelectTrigger id={id} className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CONVERSATION_FIELD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{copy.tagsFields[`type_${t}`]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </Field>
          {type === "select" ? (
            <Field label={copy.tagsFields.options} hint={copy.tagsFields.optionsHint}>
              {(id) => <Textarea id={id} rows={5} value={options} onChange={(e) => setOptions(e.target.value)} />}
            </Field>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{copy.common.cancel}</Button>
            <Button type="submit" disabled={saving || !ready}>{saving ? copy.common.saving : copy.common.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

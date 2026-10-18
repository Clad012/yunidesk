import { useState, type KeyboardEvent } from "react";
import type { ConversationField, CustomFieldValue } from "yunidesk";
import { copy } from "@/lib/copy";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const NONE = "__none";
const MAX_TEXT = 1000;

interface FieldInputProps {
  id: string;
  field: ConversationField;
  value: CustomFieldValue | undefined;
  onSave: (value: CustomFieldValue | null) => void;
}

/** Text and numbers save on blur or Enter; choices, checkboxes and dates save as soon as they change. */
export function FieldInput({ id, field, value, onSave }: FieldInputProps) {
  switch (field.type) {
    case "select":
      return (
        <Select value={typeof value === "string" ? value : NONE} onValueChange={(v) => onSave(v === NONE ? null : v)}>
          <SelectTrigger id={id} className="h-8 w-full">
            <SelectValue placeholder={copy.fields.choose} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE} className="text-muted-foreground">{copy.fields.notSet}</SelectItem>
            {field.options.map((option) => (
              <SelectItem key={option} value={option}>{option}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    case "checkbox":
      return <Checkbox id={id} checked={value === true} onCheckedChange={(checked) => onSave(checked === true)} />;
    case "date":
      return (
        <Input
          id={id}
          type="date"
          className="h-8"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onSave(e.target.value || null)}
        />
      );
    case "number":
    case "text":
      return <TypedInput id={id} field={field} value={value} onSave={onSave} />;
  }
}

function TypedInput({ id, field, value, onSave }: FieldInputProps) {
  const initial = value === undefined ? "" : String(value);
  const [draft, setDraft] = useState(initial);
  const commit = () => {
    const text = draft.trim();
    if (text === initial) return;
    if (!text) return onSave(null);
    if (field.type === "number") {
      const n = Number(text);
      if (!Number.isFinite(n)) return setDraft(initial);
      return onSave(n);
    }
    onSave(text);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") e.currentTarget.blur();
    if (e.key === "Escape") setDraft(initial);
  };
  return (
    <Input
      id={id}
      type={field.type === "number" ? "number" : "text"}
      inputMode={field.type === "number" ? "decimal" : undefined}
      maxLength={field.type === "text" ? MAX_TEXT : undefined}
      className="h-8"
      placeholder={copy.fields.notSet}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  );
}

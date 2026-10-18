import { useId } from "react";
import type { AgentConversation, ConversationField, CustomFieldValue } from "yunidesk";
import { copy } from "@/lib/copy";
import { Skeleton } from "@/components/ui/skeleton";
import { useConversationFields } from "@/features/tags/use-tags";
import type { useConversationActions } from "../use-conversation-actions";
import { FieldInput } from "./field-input";

interface ConversationFieldsProps {
  conversation: AgentConversation;
  onSave: ReturnType<typeof useConversationActions>["setField"];
  /** False for viewers: values are shown, not edited. */
  editable: boolean;
}

function FieldRow({ field, value, onSave }: { field: ConversationField; value: CustomFieldValue | undefined; onSave: (v: CustomFieldValue | null) => void }) {
  const id = useId();
  const inline = field.type === "checkbox";
  return (
    <div className={inline ? "flex items-center justify-between gap-3" : "flex flex-col gap-1"}>
      <label htmlFor={id} className="truncate text-xs text-muted-foreground">{field.label}</label>
      {/* Remount when the stored value changes (e.g. a teammate edited it) so drafts don't go stale. */}
      <FieldInput key={String(value)} id={id} field={field} value={value} onSave={onSave} />
    </div>
  );
}

function shownValue(value: CustomFieldValue | undefined): string {
  if (value === undefined || value === null || value === "") return copy.fields.notSet;
  if (typeof value === "boolean") return value ? copy.fields.yes : copy.fields.no;
  return String(value);
}

function ReadOnlyField({ field, value }: { field: ConversationField; value: CustomFieldValue | undefined }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="truncate text-xs text-muted-foreground">{field.label}</span>
      <span className="text-sm">{shownValue(value)}</span>
    </div>
  );
}

/** The team's custom fields for this conversation, editable in place. */
export function ConversationFields({ conversation, onSave, editable }: ConversationFieldsProps) {
  const fields = useConversationFields();
  if (fields.isPending) return <Skeleton className="h-8 w-full" />;
  const items = fields.data?.items ?? [];
  if (items.length === 0) return <p className="text-xs text-muted-foreground">{copy.fields.empty}</p>;
  return (
    <div className="flex flex-col gap-3">
      {items.map((field) =>
        editable ? (
          <FieldRow key={field.id} field={field} value={conversation.customFields[field.key]} onSave={(value) => onSave(field.key, value)} />
        ) : (
          <ReadOnlyField key={field.id} field={field} value={conversation.customFields[field.key]} />
        ),
      )}
    </div>
  );
}

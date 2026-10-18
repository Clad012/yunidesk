import { RULE_CHANNELS, type AssignmentConditions } from "yunidesk";
import { copy } from "@/lib/copy";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTags } from "@/features/tags/use-tags";

/** Attribute key/value as typed; both empty means no attribute condition. */
export interface AttributeDraft {
  key: string;
  value: string;
}

interface RuleConditionsProps {
  conditions: AssignmentConditions;
  attribute: AttributeDraft;
  onChange: (patch: Partial<AssignmentConditions>) => void;
  onAttributeChange: (attribute: AttributeDraft) => void;
}

const ANY = "any";

/** The "When" half of a rule: every condition set here must match. */
export function RuleConditions({ conditions, attribute, onChange, onAttributeChange }: RuleConditionsProps) {
  const tags = useTags();
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={copy.assignment.channel}>
        {(id) => (
          <Select value={conditions.channel} onValueChange={(v) => onChange({ channel: v as AssignmentConditions["channel"] })}>
            <SelectTrigger id={id}><SelectValue /></SelectTrigger>
            <SelectContent>
              {RULE_CHANNELS.map((c) => <SelectItem key={c} value={c}>{copy.assignment[`channel_${c}`]}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field label={copy.assignment.contact}>
        {(id) => (
          <Select value={conditions.contact} onValueChange={(v) => onChange({ contact: v as AssignmentConditions["contact"] })}>
            <SelectTrigger id={id}><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["any", "identified", "anonymous"] as const).map((c) => <SelectItem key={c} value={c}>{copy.assignment[`contact_${c}`]}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field label={copy.assignment.tag} className="sm:col-span-2">
        {(id) => (
          <Select value={conditions.tagId ?? ANY} onValueChange={(v) => onChange({ tagId: v === ANY ? null : v })}>
            <SelectTrigger id={id}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{copy.assignment.anyTag}</SelectItem>
              {conditions.tagId && !tags.data?.items.some((t) => t.id === conditions.tagId) ? (
                <SelectItem value={conditions.tagId}>{copy.assignment.deletedTag}</SelectItem>
              ) : null}
              {(tags.data?.items ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field label={copy.assignment.attributeKey}>
        {(id) => (
          <Input id={id} maxLength={64} placeholder={copy.assignment.attributeKeyPlaceholder} value={attribute.key} onChange={(e) => onAttributeChange({ ...attribute, key: e.target.value })} />
        )}
      </Field>
      <Field label={copy.assignment.attributeValue}>
        {(id) => (
          <Input id={id} maxLength={200} placeholder={copy.assignment.attributeValuePlaceholder} value={attribute.value} onChange={(e) => onAttributeChange({ ...attribute, value: e.target.value })} />
        )}
      </Field>
      <p className="-mt-1 text-xs text-muted-foreground sm:col-span-2">{copy.assignment.attributeHint}</p>
    </div>
  );
}

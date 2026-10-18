import { useState, type FormEvent } from "react";
import type { AssignmentConditions, AssignmentRuleInput } from "yunidesk";
import { copy } from "@/lib/copy";
import { Field } from "@/components/field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TeamAndStrategy } from "./assign-select";
import { RuleConditions, type AttributeDraft } from "./rule-conditions";
import { EMPTY_CONDITIONS } from "./rule-summary";

interface RuleDialogProps {
  initial: AssignmentRuleInput | null;
  teams: readonly { id: string; name: string }[];
  saving: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (rule: AssignmentRuleInput) => void;
}

export function RuleDialog({ initial, teams, saving, onOpenChange, onSave }: RuleDialogProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [conditions, setConditions] = useState<AssignmentConditions>(initial?.conditions ?? EMPTY_CONDITIONS);
  const [attribute, setAttribute] = useState<AttributeDraft>(initial?.conditions.attribute ?? { key: "", value: "" });
  const [teamId, setTeamId] = useState(initial?.teamId ?? teams[0]?.id ?? "");
  const [assign, setAssign] = useState(initial?.assign ?? "round_robin");
  const key = attribute.key.trim();
  const ready = name.trim() !== "" && teamId !== "" && (key !== "" || attribute.value.trim() === "");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    onSave({
      ...(initial?.id ? { id: initial.id } : {}),
      name: name.trim(),
      conditions: { ...conditions, attribute: key ? { key, value: attribute.value.trim() } : null },
      teamId,
      assign,
    });
  };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>{initial ? copy.assignment.editRule : copy.assignment.newRule}</DialogTitle>
            <DialogDescription>{copy.assignment.rulesHint}</DialogDescription>
          </DialogHeader>
          <Field label={copy.assignment.ruleName}>
            {(id) => <Input id={id} required autoFocus maxLength={80} placeholder={copy.assignment.ruleNamePlaceholder} value={name} onChange={(e) => setName(e.target.value)} />}
          </Field>
          <p className="text-xs font-medium text-muted-foreground uppercase">{copy.assignment.when}</p>
          <RuleConditions conditions={conditions} attribute={attribute} onChange={(patch) => setConditions((c) => ({ ...c, ...patch }))} onAttributeChange={setAttribute} />
          <p className="text-xs font-medium text-muted-foreground uppercase">{copy.assignment.then}</p>
          <TeamAndStrategy teams={teams} teamId={teamId} assign={assign} onTeam={setTeamId} onAssign={setAssign} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{copy.common.cancel}</Button>
            <Button type="submit" disabled={saving || !ready}>{saving ? copy.common.saving : copy.common.save}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

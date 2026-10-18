import { ASSIGN_STRATEGIES, type AssignStrategy } from "yunidesk";
import { copy } from "@/lib/copy";
import { Field } from "@/components/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TeamOption {
  id: string;
  name: string;
}

/** "Send to <team>, assign by <strategy>": the action of a rule, and of the fallback. */
export function TeamAndStrategy({
  teams,
  teamId,
  assign,
  onTeam,
  onAssign,
}: {
  teams: readonly TeamOption[];
  teamId: string;
  assign: AssignStrategy;
  onTeam: (teamId: string) => void;
  onAssign: (assign: AssignStrategy) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={copy.assignment.sendTo}>
        {(id) => (
          <Select value={teamId} onValueChange={onTeam}>
            <SelectTrigger id={id}><SelectValue placeholder={copy.teams.team} /></SelectTrigger>
            <SelectContent>
              {teams.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </Field>
      <Field label={copy.assignment.assign} hint={copy.assignment[`assignHint_${assign}`]}>
        {(id) => (
          <Select value={assign} onValueChange={(v) => onAssign(v as AssignStrategy)}>
            <SelectTrigger id={id}><SelectValue /></SelectTrigger>
            <SelectContent>
              {ASSIGN_STRATEGIES.map((s) => <SelectItem key={s} value={s}>{copy.assignment[`assign_${s}`]}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </Field>
    </div>
  );
}

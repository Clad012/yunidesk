import { ChevronDownIcon, ChevronUpIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import type { AssignmentRule, AssignmentRuleInput, AssignmentSettings } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { useCan } from "@/hooks/use-bootstrap";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTags } from "@/features/tags/use-tags";
import { useTeams } from "@/features/teams/use-teams";
import { ConfirmDialog } from "../confirm-dialog";
import { SettingsCard } from "../settings-page";
import { RuleDialog } from "./rule-dialog";
import { describeAction, describeConditions } from "./rule-summary";
import { toInput, useAssignment, useSaveAssignment } from "./use-team-settings";

/** The ordered rules: add, edit, reorder and delete each save the whole list. */
export function RulesCard() {
  const owner = useCan("teams.manage");
  const assignment = useAssignment();
  const teams = useTeams();
  const tags = useTags();
  const save = useSaveAssignment();
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [deleting, setDeleting] = useState<AssignmentRule | null>(null);
  const rules = assignment.data?.rules ?? [];
  const teamList = (teams.data?.items ?? []).map(({ id, name }) => ({ id, name }));

  const commit = (settings: AssignmentSettings, next: AssignmentRuleInput[], onDone?: () => void) =>
    save.mutate({ ...toInput(settings), rules: next }, { onSuccess: () => onDone?.() });
  const onSave = (rule: AssignmentRuleInput) => {
    if (!assignment.data || editing === null) return;
    const next: AssignmentRuleInput[] = [...rules];
    if (editing === "new") next.push(rule);
    else next[editing] = rule;
    commit(assignment.data, next, () => setEditing(null));
  };
  const move = (index: number, delta: number) => {
    if (!assignment.data) return;
    const next: AssignmentRuleInput[] = [...rules];
    const [moved] = next.splice(index, 1);
    next.splice(index + delta, 0, moved!);
    commit(assignment.data, next);
  };

  return (
    <SettingsCard title={copy.assignment.rulesTitle} description={copy.assignment.rulesHint}>
      {owner ? (
        <div className="flex items-center gap-3">
          <Button size="sm" variant="outline" disabled={teamList.length === 0 || !assignment.data} onClick={() => setEditing("new")}>
            <PlusIcon /> {copy.assignment.addRule}
          </Button>
          {teams.data && teamList.length === 0 ? <span className="text-xs text-muted-foreground">{copy.assignment.needTeam}</span> : null}
        </div>
      ) : null}
      {assignment.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : assignment.isError ? (
        <p className="text-sm text-destructive">{copy.common.somethingWrong}</p>
      ) : rules.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{copy.assignment.noRules}</p>
      ) : (
        <ol className="-my-2 divide-y">
          {rules.map((rule, index) => (
            <li key={rule.id} className="flex items-center gap-3 py-2">
              <span className="w-5 shrink-0 text-center text-xs text-muted-foreground tabular-nums">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{rule.name}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {describeConditions(rule.conditions, tags.data?.items ?? [])} {describeAction(rule, teamList)}
                </p>
              </div>
              {owner ? (
                <>
                  <Button size="icon-xs" variant="ghost" aria-label={copy.tagsFields.moveUp} disabled={index === 0 || save.isPending} onClick={() => move(index, -1)}>
                    <ChevronUpIcon />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label={copy.tagsFields.moveDown} disabled={index === rules.length - 1 || save.isPending} onClick={() => move(index, 1)}>
                    <ChevronDownIcon />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label={copy.assignment.editRule} onClick={() => setEditing(index)}>
                    <PencilIcon />
                  </Button>
                  <Button size="icon-xs" variant="ghost" aria-label={copy.common.delete} className="text-destructive hover:text-destructive" onClick={() => setDeleting(rule)}>
                    <Trash2Icon />
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ol>
      )}
      {editing !== null ? (
        <RuleDialog
          key={editing === "new" ? "new" : rules[editing]?.id}
          initial={editing === "new" ? null : (rules[editing] ?? null)}
          teams={teamList}
          saving={save.isPending}
          onOpenChange={(open) => !open && setEditing(null)}
          onSave={onSave}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title={copy.assignment.deleteRuleTitle}
        body={deleting ? fmt(copy.assignment.deleteRuleBody, { name: deleting.name }) : ""}
        action={copy.common.delete}
        destructive
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={() => deleting && assignment.data && commit(assignment.data, rules.filter((r) => r.id !== deleting.id))}
      />
    </SettingsCard>
  );
}

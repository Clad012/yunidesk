import { useState } from "react";
import type { AssignmentSettings, AssignStrategy } from "yunidesk";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { useIsOwner } from "@/hooks/use-bootstrap";
import { Button } from "@/components/ui/button";
import { useTeams } from "@/features/teams/use-teams";
import { SettingsCard } from "../settings-page";
import { TeamAndStrategy } from "./assign-select";
import { toInput, useAssignment, useSaveAssignment } from "./use-team-settings";

type Fallback = AssignmentSettings["fallback"];

function Choice({ active, disabled, label, onSelect }: { active: boolean; disabled: boolean; label: string; onSelect: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "flex-1 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:opacity-60",
        active ? "bg-primary/10 font-medium text-primary" : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}

/** Where a conversation goes when no rule matches: nowhere (today's behaviour) or a default team. */
export function FallbackCard() {
  const owner = useIsOwner();
  const assignment = useAssignment();
  const teams = useTeams();
  const save = useSaveAssignment(copy.assignment.fallbackSaved);
  const [draft, setDraft] = useState<Fallback | null>(null);
  const teamList = (teams.data?.items ?? []).map(({ id, name }) => ({ id, name }));
  const saved = assignment.data?.fallback;
  if (!saved) return null;
  const current = draft ?? saved;
  const dirty = draft !== null && (draft.teamId !== saved.teamId || (draft.teamId !== null && draft.assign !== saved.assign));
  const toTeam = current.teamId !== null;
  const set = (patch: Partial<Fallback>) => setDraft({ ...current, ...patch });

  return (
    <SettingsCard title={copy.assignment.fallbackTitle}>
      <div role="radiogroup" className="flex flex-col gap-2 sm:flex-row">
        <Choice active={!toTeam} disabled={!owner} label={copy.assignment.fallbackUnassigned} onSelect={() => set({ teamId: null })} />
        <Choice
          active={toTeam}
          disabled={!owner || teamList.length === 0}
          label={copy.assignment.fallbackTeam}
          onSelect={() => set({ teamId: current.teamId ?? teamList[0]?.id ?? null, assign: current.assign === "none" && !toTeam ? "round_robin" : current.assign })}
        />
      </div>
      {toTeam ? (
        <fieldset disabled={!owner} className="contents">
          <TeamAndStrategy
            teams={teamList}
            teamId={current.teamId ?? ""}
            assign={current.assign}
            onTeam={(teamId) => set({ teamId })}
            onAssign={(assign: AssignStrategy) => set({ assign })}
          />
        </fieldset>
      ) : null}
      {owner && dirty && assignment.data ? (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={() => setDraft(null)} disabled={save.isPending}>{copy.settings.discard}</Button>
          <Button
            size="sm"
            disabled={save.isPending}
            onClick={() => save.mutate({ ...toInput(assignment.data!), fallback: current }, { onSuccess: () => setDraft(null) })}
          >
            {save.isPending ? copy.common.saving : copy.common.save}
          </Button>
        </div>
      ) : null}
    </SettingsCard>
  );
}

import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { useState } from "react";
import type { Team } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { useIsOwner } from "@/hooks/use-bootstrap";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useTeams } from "@/features/teams/use-teams";
import { ConfirmDialog } from "../confirm-dialog";
import { SettingsCard } from "../settings-page";
import { TeamDialog } from "./team-dialog";
import { TeamMembers } from "./team-members";
import { useTeamMutations } from "./use-team-settings";

export function TeamsCard() {
  const owner = useIsOwner();
  const teams = useTeams();
  const { create, rename, remove, addMember, removeMember } = useTeamMutations();
  const [editing, setEditing] = useState<Team | "new" | null>(null);
  const [deleting, setDeleting] = useState<Team | null>(null);
  const items = teams.data?.items ?? [];
  const save = editing === "new" ? create : rename;

  const onSave = (name: string) => {
    const done = { onSuccess: () => setEditing(null) };
    if (editing === "new") create.mutate(name, done);
    else if (editing) rename.mutate({ id: editing.id, name }, done);
  };

  return (
    <SettingsCard title={copy.teams.teamsTitle} description={copy.teams.teamsHint}>
      {owner ? (
        <div>
          <Button size="sm" variant="outline" onClick={() => (create.reset(), setEditing("new"))}>
            <PlusIcon /> {copy.teams.newTeam}
          </Button>
        </div>
      ) : null}
      {teams.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : teams.isError ? (
        <p className="text-sm text-destructive">{copy.common.somethingWrong}</p>
      ) : items.length === 0 ? (
        <div className="py-4 text-center">
          <p className="text-sm text-muted-foreground">{copy.teams.noTeams}</p>
          {owner ? <p className="mt-1 text-xs text-muted-foreground">{copy.teams.noTeamsHint}</p> : null}
        </div>
      ) : (
        <ul className="-my-2 divide-y">
          {items.map((team) => (
            <li key={team.id} className="flex flex-col gap-2 py-3">
              <div className="flex items-center gap-3">
                <span className="truncate text-sm font-medium">{team.name}</span>
                <span className="flex-1 truncate text-xs text-muted-foreground">
                  {fmt(copy.teams.openCount, { n: team.openCount, unassigned: team.unassignedCount })}
                </span>
                {owner ? (
                  <>
                    <Button size="icon-xs" variant="ghost" aria-label={copy.teams.editTeam} onClick={() => (rename.reset(), setEditing(team))}>
                      <PencilIcon />
                    </Button>
                    <Button size="icon-xs" variant="ghost" aria-label={copy.common.delete} className="text-destructive hover:text-destructive" onClick={() => setDeleting(team)}>
                      <Trash2Icon />
                    </Button>
                  </>
                ) : null}
              </div>
              <TeamMembers
                team={team}
                editable={owner}
                onAdd={(agentId) => addMember.mutate({ teamId: team.id, agentId })}
                onRemove={(agentId) => removeMember.mutate({ teamId: team.id, agentId })}
              />
            </li>
          ))}
        </ul>
      )}
      {editing ? (
        <TeamDialog
          key={editing === "new" ? "new" : editing.id}
          initialName={editing === "new" ? null : editing.name}
          saving={save.isPending}
          error={save.error ? errorMessage(save.error, copy.common.somethingWrong) : null}
          onOpenChange={(open) => !open && setEditing(null)}
          onSave={onSave}
        />
      ) : null}
      <ConfirmDialog
        open={deleting !== null}
        title={copy.teams.deleteTitle}
        body={deleting ? fmt(copy.teams.deleteBody, { name: deleting.name }) : ""}
        action={copy.common.delete}
        destructive
        onOpenChange={(open) => !open && setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </SettingsCard>
  );
}

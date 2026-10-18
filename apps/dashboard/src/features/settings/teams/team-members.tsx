import { UserPlusIcon, XIcon } from "lucide-react";
import type { Team } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

interface TeamMembersProps {
  team: Team;
  editable: boolean;
  onAdd: (agentId: string) => void;
  onRemove: (agentId: string) => void;
}

/** Members with their status and load; owners add and remove them. */
export function TeamMembers({ team, editable, onAdd, onRemove }: TeamMembersProps) {
  const { teammates } = useBootstrap();
  const outside = teammates.filter((t) => !team.members.some((m) => m.id === t.id));
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {team.members.length === 0 ? <span className="text-xs text-muted-foreground">{copy.teams.noMembers}</span> : null}
      {team.members.map((m) => {
        const away = m.availability === "away";
        return (
          <span key={m.id} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-muted pr-1.5 pl-0.5 text-xs">
            <PersonAvatar name={m.name} avatarUrl={m.avatarUrl} seed={m.id} away={away} className="size-6 text-[9px]" />
            <span className="max-w-32 truncate font-medium">{m.name}</span>
            <span className="text-muted-foreground">
              {away ? copy.availability.away : m.maxOpen !== null ? fmt(copy.teams.loadOf, { n: m.openCount, max: m.maxOpen }) : fmt(copy.teams.load, { n: m.openCount })}
            </span>
            {editable ? (
              <button
                type="button"
                onClick={() => onRemove(m.id)}
                aria-label={fmt(copy.teams.removeMember, { name: m.name })}
                className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            ) : null}
          </span>
        );
      })}
      {editable ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="xs" variant="ghost" className="text-muted-foreground">
              <UserPlusIcon /> {copy.teams.addMember}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {outside.length === 0 ? (
              <DropdownMenuItem disabled>{copy.teams.everyoneIn}</DropdownMenuItem>
            ) : (
              outside.map((t) => (
                <DropdownMenuItem key={t.id} onSelect={() => onAdd(t.id)}>
                  <PersonAvatar name={t.name} avatarUrl={t.avatarUrl} seed={t.id} className="size-5 text-[9px]" />
                  <span className="flex-1 truncate">{t.name}</span>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

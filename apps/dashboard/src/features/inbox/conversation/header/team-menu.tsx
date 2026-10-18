import { CheckIcon, UsersRoundIcon, XIcon } from "lucide-react";
import type { TeamRef } from "yunidesk";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTeams } from "@/features/teams/use-teams";

interface TeamMenuProps {
  team: TeamRef | null;
  onChange: (teamId: string | null) => void;
}

/** Shows the conversation's team and moves it to another one. Hidden until the workspace has teams. */
export function TeamMenu({ team, onChange }: TeamMenuProps) {
  const teams = useTeams();
  const items = teams.data?.items ?? [];
  if (items.length === 0 && !team) return null;
  return (
    <DropdownMenu>
      <Tip label={copy.teams.moveTo}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`${copy.teams.team}: ${team?.name ?? copy.teams.noTeam}`}
            className={cn("max-w-40 gap-1.5 text-muted-foreground hover:text-foreground", team && "text-foreground")}
          >
            <UsersRoundIcon />
            {team ? <span className="hidden truncate xl:inline">{team.name}</span> : null}
          </Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>{copy.teams.moveTo}</DropdownMenuLabel>
        {items.map((t) => (
          <DropdownMenuItem key={t.id} onSelect={() => t.id !== team?.id && onChange(t.id)}>
            <span className="flex-1 truncate">{t.name}</span>
            {t.id === team?.id ? <CheckIcon className="text-primary" /> : null}
          </DropdownMenuItem>
        ))}
        {team ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onChange(null)}>
              <XIcon /> {copy.teams.removeFromTeam}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

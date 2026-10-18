import { useNavigate } from "@tanstack/react-router";
import { UsersRoundIcon } from "lucide-react";
import { copy, fmt } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { useTeams } from "@/features/teams/use-teams";
import { useInboxParams } from "../lib/use-inbox-params";
import { useSetFilters } from "../lib/use-set-filters";

/** The teams I'm in, with their open counts; picking one shows that team's open conversations. */
export function TeamsNav() {
  const { agent } = useBootstrap();
  const teams = useTeams();
  const { filters, q } = useInboxParams();
  const setFilters = useSetFilters();
  const navigate = useNavigate();
  const mine = (teams.data?.items ?? []).filter((team) => team.members.some((m) => m.id === agent.id));
  if (mine.length === 0) return null;
  return (
    <nav className="flex min-h-0 flex-col gap-0.5" aria-label={copy.teams.myTeams}>
      <p className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">{copy.teams.myTeams}</p>
      <div className="-mr-1 flex max-h-48 flex-col gap-0.5 overflow-y-auto pr-1 scrollbar-thin">
        {mine.map((team) => {
          const active = filters.team === team.id;
          const open = () =>
            active
              ? setFilters({ team: null })
              : void navigate({ to: "/inbox/$view", params: { view: "open" }, search: { team: team.id, ...(q ? { q } : {}) } });
          return (
            <button
              key={team.id}
              type="button"
              aria-pressed={active}
              title={fmt(copy.teams.filterTitle, { name: team.name })}
              onClick={open}
              className={cn(
                "flex h-8 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                active && "bg-card font-medium text-foreground shadow-xs",
              )}
            >
              <UsersRoundIcon className="size-4 shrink-0" strokeWidth={1.8} />
              <span className="flex-1 truncate">{team.name}</span>
              {team.openCount > 0 ? <span className="text-xs text-muted-foreground tabular-nums">{team.openCount}</span> : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

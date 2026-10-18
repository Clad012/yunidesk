import { ListFilterIcon, UsersRoundIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { ConversationPriority } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TagDot } from "@/features/tags/tag-chip";
import { useTags } from "@/features/tags/use-tags";
import { useTeams } from "@/features/teams/use-teams";
import { PRIORITY_ORDER, PriorityIcon } from "../lib/priority";
import { useInboxParams } from "../lib/use-inbox-params";
import { useSetFilters } from "../lib/use-set-filters";

/** Priority filter and "urgent first" sort, in the list header. */
export function ListFilterMenu() {
  const { filters } = useInboxParams();
  const setFilters = useSetFilters();
  const active = Boolean(filters.priority || filters.sort);
  return (
    <DropdownMenu>
      <Tip label={copy.priority.filters}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={copy.priority.filters} className={cn("ml-auto", active && "text-primary")}>
            <ListFilterIcon />
          </Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel>{copy.priority.label}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={filters.priority ?? "any"}
          onValueChange={(value) => setFilters({ priority: value === "any" ? null : (value as ConversationPriority) })}
        >
          <DropdownMenuRadioItem value="any">{copy.priority.any}</DropdownMenuRadioItem>
          {PRIORITY_ORDER.map((p) => (
            <DropdownMenuRadioItem key={p} value={p}>
              <PriorityIcon priority={p} />
              {copy.priority[p]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{copy.priority.sort}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={filters.sort ?? "recent"} onValueChange={(value) => setFilters({ sort: value === "priority" ? "priority" : null })}>
          <DropdownMenuRadioItem value="recent">{copy.priority.newestFirst}</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="priority">{copy.priority.urgentFirst}</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilterPill({ children, onClear }: { children: ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-md bg-muted pr-1 pl-1.5 text-xs">
      {children}
      <button type="button" onClick={onClear} className="rounded-sm text-muted-foreground hover:text-foreground" aria-label={copy.tags.clearFilter}>
        <XIcon className="size-3" />
      </button>
    </span>
  );
}

/** What the list is narrowed to, each with a way out. */
export function ActiveFilters() {
  const { filters } = useInboxParams();
  const setFilters = useSetFilters();
  const tags = useTags();
  const teams = useTeams();
  if (!filters.tag && !filters.team && !filters.priority && !filters.sort) return null;
  const tag = filters.tag ? tags.data?.items.find((t) => t.id === filters.tag) : undefined;
  const team = filters.team ? teams.data?.items.find((t) => t.id === filters.team) : undefined;
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2">
      {filters.tag ? (
        <FilterPill onClear={() => setFilters({ tag: null })}>
          {tag ? <TagDot color={tag.color} /> : null}
          <span className="max-w-40 truncate">{tag ? fmt(copy.tags.filterTitle, { name: tag.name }) : copy.tags.title}</span>
        </FilterPill>
      ) : null}
      {filters.team ? (
        <FilterPill onClear={() => setFilters({ team: null })}>
          <UsersRoundIcon className="size-3.5" />
          <span className="max-w-40 truncate">{team ? fmt(copy.teams.filterTitle, { name: team.name }) : copy.teams.team}</span>
        </FilterPill>
      ) : null}
      {filters.priority ? (
        <FilterPill onClear={() => setFilters({ priority: null })}>
          <PriorityIcon priority={filters.priority} className="size-3.5" />
          {copy.priority[filters.priority]}
        </FilterPill>
      ) : null}
      {filters.sort ? <FilterPill onClear={() => setFilters({ sort: null })}>{copy.priority.urgentFirst}</FilterPill> : null}
    </div>
  );
}

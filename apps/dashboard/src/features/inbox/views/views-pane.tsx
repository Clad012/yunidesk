import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlarmClockIcon, CircleCheckIcon, InboxIcon, LayersIcon, MessagesSquareIcon, UserRoundIcon, type LucideIcon } from "lucide-react";
import type { InboxCounts } from "yunidesk";
import { copy } from "@/lib/copy";
import { endpoints, queryKeys, type InboxView } from "@/lib/endpoints";
import { NumberTicker } from "@/components/magicui/number-ticker";
import { useInboxParams } from "../lib/use-inbox-params";
import { SearchBox } from "./search-box";
import { TagsNav } from "./tags-nav";
import { TeamPresence } from "./team-presence";
import { TeamsNav } from "./teams-nav";

const VIEWS: { view: InboxView; icon: LucideIcon; count?: keyof InboxCounts }[] = [
  { view: "mine", icon: UserRoundIcon, count: "mine" },
  { view: "unassigned", icon: InboxIcon, count: "unassigned" },
  { view: "open", icon: MessagesSquareIcon, count: "open" },
  { view: "snoozed", icon: AlarmClockIcon, count: "snoozed" },
  { view: "resolved", icon: CircleCheckIcon },
  { view: "all", icon: LayersIcon },
];

export function ViewsPane() {
  const { search } = useInboxParams();
  const counts = useQuery({ queryKey: queryKeys.counts, queryFn: endpoints.counts });
  return (
    <aside className="hidden w-48 shrink-0 flex-col gap-4 py-3 pr-2 md:flex xl:w-56">
      <h1 className="px-2 text-lg font-semibold tracking-tight">{copy.views.title}</h1>
      <SearchBox />
      <nav className="flex flex-col gap-0.5">
        {VIEWS.map(({ view, icon: Icon, count }) => {
          const value = count ? counts.data?.[count] : undefined;
          return (
            <Link
              key={view}
              to="/inbox/$view"
              params={{ view }}
              search={search}
              activeOptions={{ includeSearch: false }}
              className="group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[status=active]:bg-card data-[status=active]:font-medium data-[status=active]:text-foreground data-[status=active]:shadow-xs"
            >
              <Icon className="size-4 shrink-0 group-data-[status=active]:text-primary" strokeWidth={1.8} />
              <span className="flex-1 truncate">{copy.views[view]}</span>
              {value !== undefined && value > 0 ? <NumberTicker value={value} className="text-xs text-muted-foreground" /> : null}
            </Link>
          );
        })}
      </nav>
      <TeamsNav />
      <TagsNav />
      <TeamPresence />
    </aside>
  );
}

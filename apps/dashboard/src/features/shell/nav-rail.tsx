import { Link } from "@tanstack/react-router";
import { ChartColumnIcon, InboxIcon, SettingsIcon, UsersIcon, type LucideIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { copy } from "@/lib/copy";
import { endpoints, queryKeys } from "@/lib/endpoints";
import { Tip } from "@/components/ui/tooltip";
import { ConnectionDot } from "./connection-dot";
import { ProfileMenu } from "./profile-menu";
import { useIsOwner } from "@/hooks/use-bootstrap";

function RailLink({ to, label, icon: Icon, badge }: { to: "/inbox" | "/contacts" | "/reports" | "/settings"; label: string; icon: LucideIcon; badge?: number }) {
  return (
    <Tip label={label} side="right">
      <Link
        to={to}
        aria-label={label}
        className="relative flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[status=active]:bg-card data-[status=active]:text-primary data-[status=active]:shadow-sm"
      >
        <Icon className="size-5" strokeWidth={1.8} />
        {badge ? (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </Link>
    </Tip>
  );
}

export function NavRail() {
  const counts = useQuery({ queryKey: queryKeys.counts, queryFn: endpoints.counts });
  // TODO(roles): show it to everyone with the "reports.view" permission.
  const canSeeReports = useIsOwner();
  return (
    <nav className="flex w-16 shrink-0 flex-col items-center gap-1.5 py-3">
      <Link to="/inbox" className="mb-3 flex size-9 items-center justify-center rounded-xl shadow-sm" aria-label={copy.appName}>
        <img src="/favicon.svg" alt="" className="size-9 rounded-xl" />
      </Link>
      <RailLink to="/inbox" label={copy.nav.inbox} icon={InboxIcon} badge={counts.data?.mine} />
      <RailLink to="/contacts" label={copy.nav.contacts} icon={UsersIcon} />
      {canSeeReports ? <RailLink to="/reports" label={copy.nav.reports} icon={ChartColumnIcon} /> : null}
      <RailLink to="/settings" label={copy.nav.settings} icon={SettingsIcon} />
      <div className="mt-auto flex flex-col items-center gap-2">
        <ConnectionDot />
        <ProfileMenu />
      </div>
    </nav>
  );
}

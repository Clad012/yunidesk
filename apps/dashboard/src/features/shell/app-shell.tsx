import { Outlet } from "@tanstack/react-router";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { useRealtime } from "@/hooks/use-realtime";
import { useAttention } from "@/features/notifications/use-attention";
import { NotificationBanner } from "@/features/notifications/notification-banner";
import { NavRail } from "./nav-rail";
import { ShortcutsDialog } from "./shortcuts-dialog";

export function AppShell() {
  const { agent } = useBootstrap();
  useRealtime(agent.id);
  useAttention();
  return (
    <div className="flex h-full min-h-0 bg-sidebar">
      <NavRail />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <NotificationBanner />
        <div className="min-h-0 flex-1">
          <Outlet />
        </div>
      </main>
      <ShortcutsDialog />
    </div>
  );
}

import { Outlet } from "@tanstack/react-router";
import { ViewsPane } from "./views/views-pane";
import { ConversationList } from "./list/conversation-list";

export function InboxPage() {
  return (
    <div className="flex h-full min-h-0">
      <ViewsPane />
      <div className="my-2 mr-2 flex min-w-0 flex-1 overflow-hidden rounded-xl border bg-card shadow-xs">
        <ConversationList />
        <div className="flex min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

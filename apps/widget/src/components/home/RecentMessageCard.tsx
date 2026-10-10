import { ChevronRight } from "lucide-react";
import { formatRelative, type ContactConversation } from "yunidesk";
import { conversationRoute, useMessenger } from "../../state/context";
import { conversationTitle, previewText } from "../../lib/preview";
import { useNow } from "../../hooks/useNow";
import { Avatar, TeamAvatar } from "../common/Avatar";
import { cn } from "../../lib/cn";

export function RecentMessageCard({ conversation }: { conversation: ContactConversation }) {
  const { strings, locale, data, navigate } = useMessenger();
  const now = useNow();
  const agent = conversation.participants[0];
  const unread = conversation.unreadCount > 0;
  return (
    <button
      type="button"
      onClick={() => navigate(conversationRoute(conversation.id, "home"))}
      className="ys-rise group w-full cursor-pointer rounded-2xl bg-surface p-4 text-left shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-px"
    >
      <span className="block text-[13px] font-semibold text-fg">{strings.recentMessage}</span>
      <span className="mt-3 flex items-center gap-3">
        {agent ? <Avatar agent={agent} size={38} /> : <TeamAvatar name={data.config?.teamName ?? ""} size={38} />}
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate text-sm", unread ? "font-semibold text-fg" : "text-fg")}>
            {previewText(strings, conversation)}
          </span>
          <span className="mt-0.5 block truncate text-[13px] text-muted">
            {conversationTitle(conversation, data.config, strings)} · {formatRelative(strings, conversation.lastMessageAt, now, locale)}
          </span>
        </span>
        {unread ? (
          <span className="size-2.5 shrink-0 rounded-full bg-danger" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-5 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        )}
      </span>
    </button>
  );
}

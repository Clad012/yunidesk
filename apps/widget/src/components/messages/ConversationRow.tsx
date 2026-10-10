import { formatRelative, type ContactConversation } from "yunidesk";
import { conversationRoute, useMessenger } from "../../state/context";
import { conversationTitle, previewText } from "../../lib/preview";
import { useNow } from "../../hooks/useNow";
import { Avatar, TeamAvatar } from "../common/Avatar";
import { cn } from "../../lib/cn";

export function ConversationRow({ conversation }: { conversation: ContactConversation }) {
  const { strings, locale, data, navigate } = useMessenger();
  const now = useNow();
  const agent = conversation.participants[0];
  const unread = conversation.unreadCount;
  return (
    <button
      type="button"
      onClick={() => navigate(conversationRoute(conversation.id, "messages"))}
      className="flex w-full cursor-pointer items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-soft"
    >
      {agent ? <Avatar agent={agent} size={42} /> : <TeamAvatar name={data.config?.teamName ?? ""} size={42} />}
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-sm", unread ? "font-semibold" : "font-medium")}>
            {conversationTitle(conversation, data.config, strings)}
          </span>
          <span className="shrink-0 text-xs text-faint">{formatRelative(strings, conversation.lastMessageAt, now, locale)}</span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className={cn("min-w-0 flex-1 truncate text-[13px]", unread ? "font-medium text-fg" : "text-muted")}>
            {previewText(strings, conversation)}
          </span>
          {unread > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-danger px-1.5 text-[11px] font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

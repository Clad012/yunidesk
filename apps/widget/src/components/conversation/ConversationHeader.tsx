import { ChevronLeft } from "lucide-react";
import { replyTimeLabel, type ContactConversation } from "yunidesk";
import { useMessenger, type Tab } from "../../state/context";
import { AvatarStack, TeamAvatar } from "../common/Avatar";
import { CloseButton } from "../common/CloseButton";
import { IconButton } from "../common/IconButton";

export function ConversationHeader({ conversation, from }: { conversation: ContactConversation | null; from: Tab }) {
  const { strings, data, navigate } = useMessenger();
  const config = data.config;
  const participants = conversation?.participants.length ? conversation.participants : (config?.agents ?? []);
  const title = conversation?.participants.length === 1 ? conversation.participants[0]!.name : (config?.teamName ?? strings.team);
  const online = data.state.teamOnline;
  return (
    <header className="relative z-10 flex h-16 shrink-0 items-center gap-2 bg-surface px-2 shadow-[0_10px_24px_-20px_rgb(20_20_40/0.4)]">
      <IconButton label={strings.back} onClick={() => navigate({ name: from })}>
        <ChevronLeft className="size-6" aria-hidden="true" />
      </IconButton>
      {participants.length > 0 ? <AvatarStack agents={participants} size={34} /> : <TeamAvatar name={title} size={34} />}
      <div className="min-w-0 flex-1 pl-1">
        <h2 className="truncate text-[15px] leading-5 font-semibold">{title}</h2>
        <p className="flex items-center gap-1.5 truncate text-xs text-muted">
          {online && <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />}
          <span className="truncate">{config ? replyTimeLabel(strings, config.replyTime) : ""}</span>
        </p>
      </div>
      <CloseButton />
    </header>
  );
}

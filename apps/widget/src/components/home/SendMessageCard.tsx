import { SendHorizontal } from "lucide-react";
import { replyTimeLabel } from "yunidesk";
import { conversationRoute, useMessenger } from "../../state/context";

export function SendMessageCard() {
  const { strings, data, navigate } = useMessenger();
  const online = data.state.teamOnline;
  const replyTime = data.config ? replyTimeLabel(strings, data.config.replyTime) : null;
  return (
    <button
      type="button"
      data-autofocus
      onClick={() => navigate(conversationRoute(null, "home"))}
      className="ys-rise group flex w-full cursor-pointer items-center gap-3 rounded-2xl bg-surface p-4 pl-5 text-left shadow-card transition-[transform,box-shadow] duration-200 hover:-translate-y-px hover:shadow-[0_2px_4px_rgb(20_20_40/0.05),0_12px_28px_-10px_rgb(20_20_40/0.22)] [animation-delay:60ms]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold">{strings.sendUsAMessage}</span>
        <span className="mt-0.5 flex items-start gap-1.5 text-[13px] leading-[18px] text-muted">
          {online && (
            <span className="relative mt-[5px] flex size-2 shrink-0" aria-hidden="true">
              <span className="absolute inset-0 animate-ping rounded-full bg-success opacity-40" />
              <span className="relative size-2 rounded-full bg-success" />
            </span>
          )}
          <span>{online ? `${strings.online} · ${replyTime ?? ""}` : replyTime}</span>
        </span>
        {data.config?.assistant && (
          <span className="mt-1 block text-[13px] leading-[18px] text-muted">{strings.aiAssistantIntro}</span>
        )}
      </span>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-soft text-ink transition-colors group-hover:bg-brand group-hover:text-on-brand">
        <SendHorizontal className="size-[18px]" aria-hidden="true" />
      </span>
    </button>
  );
}

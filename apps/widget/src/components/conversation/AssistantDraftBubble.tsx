import { format, type AssistantDraft } from "yunidesk";
import { useMessenger } from "../../state/context";
import { assistantLabel } from "../../lib/preview";
import { AssistantAvatar } from "../common/Avatar";
import { MessageText } from "./MessageText";
import { AI_BUBBLE } from "./MessageBubble";
import { cn } from "../../lib/cn";

/** The assistant's reply while it is written: dots while it thinks, then the text so far. */
export function AssistantDraftBubble({ draft }: { draft: AssistantDraft }) {
  const { strings, data } = useMessenger();
  const label = assistantLabel(strings, data.config);
  const thinking = draft.status === "thinking" || !draft.text;
  return (
    <div className="ys-rise flex items-end gap-2 pr-14">
      <div className="mb-0.5 w-7 shrink-0">
        <AssistantAvatar size={28} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-[3px]">
        <span className="mb-0.5 ml-3 text-xs font-medium text-muted">{label}</span>
        <div role="status" aria-label={format(strings.assistantReplying, { name: label })}>
          {thinking ? (
            <div className={cn("flex h-9 items-center gap-1 rounded-[20px] px-4", AI_BUBBLE)} aria-hidden="true">
              <span className="ys-dot size-1.5 rounded-full bg-muted" />
              <span className="ys-dot size-1.5 rounded-full bg-muted" />
              <span className="ys-dot size-1.5 rounded-full bg-muted" />
            </div>
          ) : (
            <div
              aria-hidden="true"
              className={cn(
                "max-w-full rounded-[20px] px-3.5 py-2 text-[15px] leading-[1.4] break-words whitespace-pre-wrap [overflow-wrap:anywhere]",
                AI_BUBBLE,
              )}
            >
              <MessageText body={draft.text} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { MessagesSquare, SendHorizontal } from "lucide-react";
import { conversationRoute, useMessenger } from "../../state/context";
import { CloseButton } from "../common/CloseButton";
import { ErrorState, Skeleton } from "../common/States";
import { ConversationRow } from "./ConversationRow";

export function MessagesScreen() {
  const { strings, data, navigate } = useMessenger();
  const { status, state } = data;
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-surface">
      <header className="relative flex h-14 shrink-0 items-center justify-center px-14">
        <h2 className="text-[15px] font-semibold">{strings.messages}</h2>
        <div className="absolute right-3">
          <CloseButton />
        </div>
      </header>
      <div className="ys-scroll min-h-0 flex-1 overflow-y-auto pb-24">
        {status === "error" ? (
          <ErrorState message={data.error === "signin" ? strings.signInToChat : strings.loadError} onRetry={data.error === "signin" ? undefined : data.retry} />
        ) : status !== "ready" ? (
          <div className="flex flex-col gap-5 px-5 py-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-3/4" />
                </div>
              </div>
            ))}
          </div>
        ) : state.conversations.length === 0 ? (
          <div className="ys-rise flex flex-col items-center px-10 pt-16 text-center">
            <span className="flex size-14 items-center justify-center rounded-2xl bg-soft text-ink">
              <MessagesSquare className="size-7" aria-hidden="true" />
            </span>
            <p className="mt-4 text-[15px] font-semibold">{strings.noConversations}</p>
            <p className="mt-1 text-sm text-muted">{strings.noConversationsHint}</p>
          </div>
        ) : (
          <ul className="flex flex-col px-2">
            {state.conversations.map((conversation) => (
              <li key={conversation.id}>
                <ConversationRow conversation={conversation} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {status === "ready" && (
        <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
          <button
            type="button"
            data-autofocus
            onClick={() => navigate(conversationRoute(null, "messages"))}
            className="ys-rise pointer-events-auto inline-flex cursor-pointer items-center gap-2 rounded-full bg-brand px-5 py-3 text-sm font-semibold text-on-brand shadow-[0_10px_24px_-8px_rgb(20_20_40/0.45)] transition-transform duration-200 hover:-translate-y-0.5 active:scale-95"
          >
            {strings.newConversation}
            <SendHorizontal className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}

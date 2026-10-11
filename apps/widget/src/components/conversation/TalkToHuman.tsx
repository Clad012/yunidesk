import { useState } from "react";
import { LoaderCircle, UserRound } from "lucide-react";
import { useMessenger } from "../../state/context";

/** Under an AI reply while the assistant answers: hands the conversation to a person. */
export function TalkToHuman({ conversationId }: { conversationId: string }) {
  const { strings, actions, announce } = useMessenger();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  const press = async () => {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      await actions.handoff(conversationId);
      announce(strings.handedOff);
    } catch {
      setFailed(true);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="ys-fade mt-1 flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={press}
        disabled={pending}
        aria-busy={pending}
        title={strings.talkToHumanHint}
        className="flex cursor-pointer items-center gap-1.5 rounded-full bg-soft px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-soft-strong disabled:cursor-default disabled:opacity-70"
      >
        {pending ? (
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <UserRound className="size-3.5" aria-hidden="true" />
        )}
        {pending ? strings.talkToHumanPending : strings.talkToHuman}
      </button>
      {failed && (
        <p role="alert" className="ml-1 text-xs text-danger">
          {strings.talkToHumanFailed}
        </p>
      )}
    </div>
  );
}

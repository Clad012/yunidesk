import { useState } from "react";
import { Frown, Laugh, Meh } from "lucide-react";
import type { ContactConversation } from "yunidesk";
import { useMessenger } from "../../state/context";
import { cn } from "../../lib/cn";

type Score = 1 | 2 | 3;

/** After a conversation is resolved: three faces, an optional comment, then thanks. */
export function RatingCard({ conversation }: { conversation: ContactConversation }) {
  const { strings, actions } = useMessenger();
  const [score, setScore] = useState<Score | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const faces: { score: Score; label: string; Icon: typeof Frown }[] = [
    { score: 1, label: strings.rateBad, Icon: Frown },
    { score: 2, label: strings.rateOkay, Icon: Meh },
    { score: 3, label: strings.rateGreat, Icon: Laugh },
  ];
  const rated = conversation.rating;

  if (rated) {
    const face = faces.find((f) => f.score === rated.score)!;
    return (
      <div role="status" className="ys-pop mx-auto flex items-center gap-2.5 rounded-2xl bg-soft px-4 py-3 text-sm font-medium">
        <face.Icon className="size-5 text-ink" aria-hidden="true" />
        {strings.rateThanks}
      </div>
    );
  }

  const submit = async () => {
    if (!score) return;
    setBusy(true);
    setFailed(false);
    try {
      await actions.rate(conversation.id, score, comment);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label={strings.rateTitle} className="ys-rise mx-auto w-full max-w-[300px] rounded-2xl bg-soft p-4 text-center">
      <p className="text-sm font-semibold">{strings.rateTitle}</p>
      <div role="radiogroup" aria-label={strings.rateTitle} className="mt-3 grid grid-cols-3 gap-2">
        {faces.map(({ score: value, label, Icon }) => {
          const selected = score === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setScore(value)}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-1 rounded-xl py-2.5 text-xs font-medium transition-all duration-200",
                selected ? "scale-105 bg-brand text-on-brand" : "bg-surface text-muted hover:-translate-y-0.5 hover:text-fg",
                score && !selected && "opacity-60",
              )}
            >
              <Icon className="size-7" strokeWidth={1.8} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
      {score && (
        <div className="ys-rise mt-3 flex flex-col gap-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder={strings.rateCommentPlaceholder}
            aria-label={strings.rateCommentPlaceholder}
            className="resize-none rounded-xl bg-surface px-3 py-2 text-left text-sm text-fg outline-none placeholder:text-faint focus-visible:shadow-[0_0_0_2px_var(--ys-ink)]"
          />
          {failed && (
            <p role="alert" className="text-xs text-danger">
              {strings.loadError}
            </p>
          )}
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="cursor-pointer rounded-xl bg-brand py-2.5 text-sm font-semibold text-on-brand transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {strings.rateSubmit}
          </button>
        </div>
      )}
    </section>
  );
}

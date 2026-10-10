import { useState, type FormEvent } from "react";
import { Mail } from "lucide-react";
import { format } from "yunidesk";
import { useMessenger } from "../../state/context";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Anonymous visitors: ask where to send replies, after their first message. */
export function EmailCard() {
  const { strings, data, actions } = useMessenger();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const saved = data.contact?.email;

  if (saved) {
    return (
      <div role="status" className="ys-rise flex items-center gap-2 self-start rounded-2xl bg-soft px-3.5 py-2.5 text-[13px] text-muted">
        <Mail className="size-4 shrink-0 text-ink" aria-hidden="true" />
        {format(strings.emailSaved, { email: saved })}
      </div>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = email.trim();
    if (!EMAIL.test(value)) {
      setError(strings.emailInvalid);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await actions.saveEmail(value);
    } catch {
      setError(strings.loadError);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="ys-rise w-full max-w-[300px] self-start rounded-2xl bg-soft p-4">
      <p className="text-sm font-semibold">{strings.emailPromptTitle}</p>
      <p className="mt-0.5 text-[13px] text-muted">{strings.emailPromptBody}</p>
      <div className="mt-3 flex gap-2">
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={strings.emailPlaceholder}
          aria-label={strings.emailPromptTitle}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "ys-email-error" : undefined}
          className="min-w-0 flex-1 rounded-xl bg-surface px-3 py-2 text-sm text-fg outline-none placeholder:text-faint focus-visible:shadow-[0_0_0_2px_var(--ys-ink)]"
        />
        <button
          type="submit"
          disabled={busy}
          className="shrink-0 cursor-pointer rounded-xl bg-brand px-3.5 text-sm font-semibold text-on-brand transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {strings.emailSave}
        </button>
      </div>
      {error && (
        <p id="ys-email-error" role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

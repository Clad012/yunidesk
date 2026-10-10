import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { ArrowUp, Paperclip } from "lucide-react";
import { ALLOWED_ATTACHMENT_TYPES, MAX_MESSAGE_LENGTH, type Attachment } from "yunidesk";
import { useMessenger } from "../../state/context";
import { isTempId } from "../../state/useActions";
import type { Uploads } from "../../hooks/useUploads";
import { AttachmentChips } from "./AttachmentChips";
import { cn } from "../../lib/cn";

const MAX_HEIGHT = 140;
/** showNewMessage(text) prefill already used, so remounting a screen doesn't apply it twice. */
let consumedPrefill = 0;
/** Unsent text per conversation, kept while the panel is closed and reopened. */
const drafts = new Map<string, string>();
const draftKey = (id: string | null) => id ?? "new";

interface ComposerProps {
  conversationId: string | null;
  uploads: Uploads;
  onSend: (body: string, attachments: Attachment[]) => void;
}

export function Composer({ conversationId, uploads, onSend }: ComposerProps) {
  const { strings, data, prefill, panelOpen } = useMessenger();
  const [text, setTextState] = useState(() => drafts.get(draftKey(conversationId)) ?? "");
  const setText = (value: string) => {
    setTextState(value);
    if (value) drafts.set(draftKey(conversationId), value);
    else drafts.delete(draftKey(conversationId));
  };
  const textarea = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const typingSent = useRef(false);
  const realId = conversationId && !isTempId(conversationId) ? conversationId : null;

  useEffect(() => {
    if (!prefill || prefill.nonce === consumedPrefill || conversationId !== null) return;
    consumedPrefill = prefill.nonce;
    setText(prefill.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill, conversationId]);

  useEffect(() => {
    if (panelOpen) textarea.current?.focus({ preventScroll: true });
  }, [panelOpen]);

  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT)}px`;
    el.style.overflowY = el.scrollHeight > MAX_HEIGHT ? "auto" : "hidden";
  }, [text]);

  const stopTyping = () => {
    if (typingSent.current && realId) data.client.sendTyping(realId, false);
    typingSent.current = false;
  };
  const stopRef = useRef(stopTyping);
  stopRef.current = stopTyping;
  useEffect(() => () => stopRef.current(), []);

  const canSend = (text.trim().length > 0 || uploads.ready.length > 0) && !uploads.busy;

  const submit = () => {
    if (!canSend) return;
    stopTyping();
    onSend(text.trim(), uploads.ready);
    setText("");
    drafts.delete("new");
    uploads.clear();
    textarea.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...event.clipboardData.files];
    if (files.length === 0) return;
    event.preventDefault();
    uploads.add(files);
  };

  const onChange = (value: string) => {
    setText(value);
    if (!realId) return;
    if (value.trim()) {
      data.client.sendTyping(realId, true);
      typingSent.current = true;
    } else stopTyping();
  };

  return (
    <div className="shrink-0 bg-surface px-3 pt-1 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      {uploads.errors.length > 0 && (
        <div role="alert" className="ys-rise mb-2 rounded-xl bg-danger-soft px-3 py-2 text-xs font-medium text-danger">
          {uploads.errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      )}
      <div className="rounded-[22px] bg-soft transition-shadow focus-within:shadow-[0_0_0_2px_var(--ys-ink)]">
        <AttachmentChips uploads={uploads} />
        <div className="flex items-end gap-1 py-1.5 pr-1.5 pl-4">
          <textarea
            ref={textarea}
            data-autofocus
            rows={1}
            value={text}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={strings.composerPlaceholder}
            aria-label={strings.composerPlaceholder}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onBlur={stopTyping}
            className="max-h-[140px] min-h-9 flex-1 resize-none bg-transparent py-2 text-[15px] leading-5 text-fg outline-none placeholder:text-faint [&:focus-visible]:outline-none"
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            aria-label={strings.attach}
            title={strings.attach}
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-soft-strong hover:text-fg"
          >
            <Paperclip className="size-[18px]" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            aria-label={strings.send}
            title={strings.send}
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-full transition-[background-color,color,transform] duration-200",
              canSend ? "cursor-pointer bg-brand text-on-brand hover:scale-105 active:scale-95" : "bg-soft-strong text-faint",
            )}
          >
            <ArrowUp className="size-[18px]" strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        accept={ALLOWED_ATTACHMENT_TYPES.join(",")}
        onChange={(e) => {
          uploads.add([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

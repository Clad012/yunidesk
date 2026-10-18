import { MAX_MESSAGE_LENGTH, type AgentConversation } from "yunidesk";
import { StickyNoteIcon, ReplyIcon } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { toast } from "sonner";
import { copy, fmt } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { contactLabel } from "../../lib/labels";
import { EmailReplyHint } from "../email/email-reply-hint";
import { AttachmentTray } from "./attachment-tray";
import { composerBus, drafts } from "./composer-bus";
import { ComposerToolbar } from "./composer-toolbar";
import { DropZone } from "./drop-zone";
import { SavedRepliesPicker } from "./saved-replies-picker";
import { useTypingSignal } from "./use-typing-signal";
import { useUploads } from "./use-uploads";
import type { ComposerMode, useSendMessage } from "./use-send-message";

interface ComposerProps {
  conversation: AgentConversation;
  send: ReturnType<typeof useSendMessage>["send"];
}

export function Composer({ conversation, send }: ComposerProps) {
  const id = conversation.id;
  const [mode, setMode] = useState<ComposerMode>("text");
  const [values, setValues] = useState(() => drafts.get(id) ?? { text: "", note: "" });
  const [pickerOpen, setPickerOpen] = useState(false);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const uploads = useUploads();
  const typing = useTypingSignal(id, mode === "note");
  const value = values[mode];

  useEffect(() => void drafts.set(id, values), [id, values]);
  useEffect(
    () =>
      composerBus.on("focus", (next) => {
        setMode(next);
        // Same element in both modes: focus now so the next keystrokes land in it, not on the hotkeys.
        textarea.current?.focus();
      }),
    [],
  );
  useLayoutEffect(() => {
    const el = textarea.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 240)}px`;
  }, [value, mode]);

  const setValue = (next: string) => setValues((v) => ({ ...v, [mode]: next }));
  const tooLong = value.length > MAX_MESSAGE_LENGTH;
  const canSend = !tooLong && !uploads.busy && !uploads.hasErrors && (value.trim().length > 0 || uploads.ready > 0);

  const submit = () => {
    if (!canSend) {
      if (tooLong) toast.error(fmt(copy.composer.tooLong, { n: MAX_MESSAGE_LENGTH }));
      return;
    }
    send(mode, value.trim(), uploads.take());
    setValue("");
    typing.stop();
    textarea.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    } else if (event.key === "Escape") {
      event.currentTarget.blur();
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(event.clipboardData.files);
    if (files.length) {
      event.preventDefault();
      uploads.add(files);
    }
  };

  const pick = (body: string) => {
    setPickerOpen(false);
    setValue(body);
    requestAnimationFrame(() => textarea.current?.focus());
  };

  return (
    <div className="shrink-0 px-4 pb-4">
      <DropZone onFiles={uploads.add}>
        <SavedRepliesPicker open={pickerOpen} onOpenChange={setPickerOpen} onPick={pick}>
          <div
            className={cn(
              "rounded-xl border bg-card shadow-xs transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30",
              mode === "note" && "border-note-border bg-note/60 focus-within:border-amber-400 focus-within:ring-amber-400/25",
            )}
          >
            <div className="flex items-center gap-2 px-2 pt-2">
              <Tabs
                value={mode}
                onValueChange={(next) => {
                  typing.stop();
                  setMode(next as ComposerMode);
                }}
              >
                <TabsList className={cn(mode === "note" && "bg-note-border/40")}>
                  <TabsTrigger value="text"><ReplyIcon /> {copy.composer.reply}</TabsTrigger>
                  <TabsTrigger value="note"><StickyNoteIcon /> {copy.composer.note}</TabsTrigger>
                </TabsList>
              </Tabs>
              {conversation.status === "resolved" && mode === "text" ? (
                <span className="truncate text-xs text-muted-foreground">{copy.composer.resolvedHint}</span>
              ) : mode === "text" ? (
                <EmailReplyHint conversation={conversation} />
              ) : null}
            </div>
            <AttachmentTray uploads={uploads.uploads} onRemove={uploads.remove} onRetry={uploads.retry} />
            <textarea
              ref={textarea}
              rows={2}
              value={value}
              onChange={(e) => {
                // "/" in an empty reply opens saved replies instead of being typed.
                if (mode === "text" && value === "" && e.target.value === "/") return setPickerOpen(true);
                setValue(e.target.value);
                if (e.target.value) typing.ping();
              }}
              onKeyDown={onKeyDown}
              onPaste={onPaste}
              onBlur={() => typing.stop()}
              placeholder={mode === "note" ? copy.composer.notePlaceholder : fmt(copy.composer.replyPlaceholder, { name: contactLabel(conversation.contact) })}
              aria-label={mode === "note" ? copy.composer.note : copy.composer.reply}
              className="block max-h-60 min-h-14 w-full resize-none bg-transparent px-3.5 py-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
            />
            {tooLong ? <p className="px-3.5 pb-1 text-xs text-destructive">{fmt(copy.composer.tooLong, { n: MAX_MESSAGE_LENGTH })}</p> : null}
            <ComposerToolbar mode={mode} canSend={canSend} onFiles={uploads.add} onSavedReplies={() => setPickerOpen(true)} onSend={submit} />
          </div>
        </SavedRepliesPicker>
      </DropZone>
    </div>
  );
}

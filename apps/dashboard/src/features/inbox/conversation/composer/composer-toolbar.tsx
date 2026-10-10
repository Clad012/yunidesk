import { MessageSquareTextIcon, PaperclipIcon, SendHorizontalIcon, StickyNoteIcon } from "lucide-react";
import { useRef } from "react";
import { ALLOWED_ATTACHMENT_TYPES } from "yunidesk";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import type { ComposerMode } from "./use-send-message";

interface ComposerToolbarProps {
  mode: ComposerMode;
  canSend: boolean;
  onFiles: (files: File[]) => void;
  onSavedReplies: () => void;
  onSend: () => void;
}

export function ComposerToolbar({ mode, canSend, onFiles, onSavedReplies, onSend }: ComposerToolbarProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-1 px-2 pb-2">
      <input
        ref={input}
        type="file"
        multiple
        hidden
        accept={ALLOWED_ATTACHMENT_TYPES.join(",")}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <Tip label={copy.composer.attach}>
        <Button type="button" variant="ghost" size="icon-sm" onClick={() => input.current?.click()} aria-label={copy.composer.attach}>
          <PaperclipIcon />
        </Button>
      </Tip>
      {mode === "text" ? (
        <Tip label={copy.composer.savedReplies}>
          <Button type="button" variant="ghost" size="icon-sm" onClick={onSavedReplies} aria-label={copy.composer.savedReplies}>
            <MessageSquareTextIcon />
          </Button>
        </Tip>
      ) : null}
      <span className="ml-2 hidden truncate text-xs text-muted-foreground lg:inline">{copy.composer.sendHint}</span>
      <Button
        type="button"
        size="sm"
        onClick={onSend}
        disabled={!canSend}
        className={cn("ml-auto", mode === "note" && "bg-amber-500 text-white hover:bg-amber-500/90 dark:bg-amber-600")}
      >
        {mode === "note" ? <StickyNoteIcon /> : <SendHorizontalIcon />}
        {mode === "note" ? copy.composer.addNote : copy.composer.send}
      </Button>
    </div>
  );
}

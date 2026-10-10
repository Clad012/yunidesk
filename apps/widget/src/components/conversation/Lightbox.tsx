import { useEffect, useRef, type KeyboardEvent } from "react";
import { Download, X } from "lucide-react";
import type { Attachment } from "yunidesk";
import { useMessenger } from "../../state/context";

/** Full-panel image viewer. Esc closes it (and only it). */
export function Lightbox({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const { strings } = useMessenger();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={attachment.fileName}
      onKeyDown={onKeyDown}
      onClick={onClose}
      className="ys-fade absolute inset-0 z-40 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
    >
      <div className="absolute top-3 right-3 flex gap-2" onClick={(e) => e.stopPropagation()}>
        <a
          href={attachment.url}
          download={attachment.fileName}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={strings.download}
          title={strings.download}
          className="flex size-10 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
        >
          <Download className="size-5" aria-hidden="true" />
        </a>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={strings.close}
          title={strings.close}
          className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
        >
          <X className="size-5" aria-hidden="true" />
        </button>
      </div>
      <img
        src={attachment.url}
        alt={attachment.fileName}
        onClick={(e) => e.stopPropagation()}
        className="ys-pop max-h-full max-w-full rounded-xl object-contain shadow-2xl"
        draggable={false}
      />
    </div>
  );
}

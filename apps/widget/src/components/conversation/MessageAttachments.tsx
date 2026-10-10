import { Download, FileText } from "lucide-react";
import { formatBytes, isInlineImage, type Attachment } from "yunidesk";
import { useMessenger } from "../../state/context";
import { localImageSizes } from "../../state/useActions";
import { cn } from "../../lib/cn";

const MAX_W = 240;
const MAX_H = 280;

function imageBox(attachment: Attachment): { width: number; height: number } {
  const known = attachment.width && attachment.height ? { width: attachment.width, height: attachment.height } : localImageSizes.get(attachment.id);
  if (!known) return { width: MAX_W, height: Math.round(MAX_W * 0.75) };
  const scale = Math.min(1, MAX_W / known.width, MAX_H / known.height);
  return { width: Math.max(80, Math.round(known.width * scale)), height: Math.max(60, Math.round(known.height * scale)) };
}

interface Props {
  attachments: Attachment[];
  side: "contact" | "team";
  onOpenImage: (attachment: Attachment) => void;
}

/** Inline images (reserved aspect ratio, open in the lightbox) and download tiles for other files. */
export function MessageAttachments({ attachments, side, onOpenImage }: Props) {
  const { strings } = useMessenger();
  if (attachments.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-1", side === "contact" ? "items-end" : "items-start")}>
      {attachments.map((attachment) =>
        attachment.isImage && isInlineImage(attachment.contentType) ? (
          <button
            key={attachment.id}
            type="button"
            onClick={() => onOpenImage(attachment)}
            aria-label={`${strings.openImage}: ${attachment.fileName}`}
            className="cursor-zoom-in overflow-hidden rounded-2xl bg-soft transition-transform duration-200 hover:scale-[1.01]"
            style={{ ...imageBox(attachment), maxWidth: "100%" }}
          >
            <img src={attachment.url} alt={attachment.fileName} loading="lazy" className="size-full object-cover" draggable={false} />
          </button>
        ) : (
          <a
            key={attachment.id}
            href={attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            download={attachment.fileName}
            aria-label={`${strings.download}: ${attachment.fileName}`}
            className="group flex w-[240px] max-w-full items-center gap-3 rounded-2xl bg-soft p-3 text-fg transition-colors hover:bg-soft-strong"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-surface text-ink">
              <FileText className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{attachment.fileName}</span>
              <span className="block text-xs text-muted">{formatBytes(attachment.size)}</span>
            </span>
            <Download className="size-4 shrink-0 text-muted transition-transform group-hover:translate-y-0.5" aria-hidden="true" />
          </a>
        ),
      )}
    </div>
  );
}

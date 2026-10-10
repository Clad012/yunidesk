import { DownloadIcon, FileIcon, FileTextIcon, FileArchiveIcon, FileAudioIcon, FileVideoIcon } from "lucide-react";
import { useState } from "react";
import { formatBytes, type Attachment } from "yunidesk";
import { cn } from "@/lib/utils";
import { Lightbox } from "./lightbox";

function fileIcon(type: string) {
  if (type.startsWith("audio/")) return FileAudioIcon;
  if (type.startsWith("video/")) return FileVideoIcon;
  if (type === "application/zip") return FileArchiveIcon;
  if (type.startsWith("text/") || type.includes("pdf") || type.includes("word")) return FileTextIcon;
  return FileIcon;
}

function ImageThumb({ attachment, single, onOpen }: { attachment: Attachment; single: boolean; onOpen: () => void }) {
  const ratio = attachment.width && attachment.height ? attachment.width / attachment.height : 4 / 3;
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn("overflow-hidden rounded-lg bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50", single ? "max-h-72 max-w-72" : "size-28")}
      style={single ? { aspectRatio: String(ratio), width: Math.min(288, 288 * ratio) } : undefined}
    >
      <img src={attachment.url} alt={attachment.fileName} loading="lazy" className="size-full object-cover transition-transform duration-300 hover:scale-[1.03]" />
    </button>
  );
}

export function Attachments({ attachments, align }: { attachments: Attachment[]; align: "start" | "end" }) {
  const [open, setOpen] = useState<number | null>(null);
  const images = attachments.filter((a) => a.isImage);
  const files = attachments.filter((a) => !a.isImage);
  if (attachments.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-1.5", align === "end" ? "items-end" : "items-start")}>
      {images.length ? (
        <div className={cn("flex flex-wrap gap-1.5", align === "end" && "justify-end")}>
          {images.map((a, i) => (
            <ImageThumb key={a.id} attachment={a} single={images.length === 1} onOpen={() => setOpen(i)} />
          ))}
        </div>
      ) : null}
      {files.map((a) => {
        const Icon = fileIcon(a.contentType);
        return (
          <a
            key={a.id}
            href={a.url}
            download={a.fileName}
            target="_blank"
            rel="noreferrer"
            className="group flex w-64 items-center gap-3 rounded-lg border bg-card px-3 py-2.5 shadow-xs transition-colors hover:bg-accent"
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Icon className="size-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{a.fileName}</span>
              <span className="block text-xs text-muted-foreground">{formatBytes(a.size)}</span>
            </span>
            <DownloadIcon className="size-4 text-muted-foreground group-hover:text-foreground" />
          </a>
        );
      })}
      <Lightbox images={images} index={open} onIndexChange={setOpen} />
    </div>
  );
}

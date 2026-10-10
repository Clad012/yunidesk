import { FileIcon, RotateCwIcon, XIcon } from "lucide-react";
import { formatBytes } from "yunidesk";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import type { PendingUpload } from "./use-uploads";

interface AttachmentTrayProps {
  uploads: PendingUpload[];
  onRemove: (key: string) => void;
  onRetry: (key: string) => void;
}

function Progress({ value }: { value: number }) {
  return (
    <span className="absolute inset-x-1.5 bottom-1.5 h-1 overflow-hidden rounded-full bg-black/20">
      <span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${Math.round(value * 100)}%` }} />
    </span>
  );
}

export function AttachmentTray({ uploads, onRemove, onRetry }: AttachmentTrayProps) {
  if (uploads.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-2 px-3 pt-3">
      {uploads.map((u) => {
        const uploading = !u.attachment && !u.error;
        return (
          <li
            key={u.key}
            className={cn("group relative flex h-14 items-center overflow-hidden rounded-lg border bg-muted/50", u.previewUrl ? "w-14" : "max-w-52 gap-2 pr-7 pl-2.5", u.error && "border-destructive/50")}
            title={u.error ?? u.file.name}
          >
            {u.previewUrl ? (
              <img src={u.previewUrl} alt={u.file.name} className={cn("size-full object-cover", uploading && "opacity-60")} />
            ) : (
              <>
                <FileIcon className="size-5 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{u.file.name}</span>
                  <span className="block text-[11px] text-muted-foreground">{u.error ? copy.composer.uploadFailed : uploading ? copy.composer.uploading : formatBytes(u.file.size)}</span>
                </span>
              </>
            )}
            {uploading ? <Progress value={u.progress} /> : null}
            {u.error ? (
              <button type="button" onClick={() => onRetry(u.key)} className="absolute inset-0 flex items-center justify-center bg-destructive/10 text-destructive" aria-label={copy.common.retry}>
                <RotateCwIcon className="size-4" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onRemove(u.key)}
              aria-label={copy.composer.removeAttachment}
              className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-foreground/70 text-background opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            >
              <XIcon className="size-3" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

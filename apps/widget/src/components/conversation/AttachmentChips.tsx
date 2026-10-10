import { AlertCircle, FileText, RotateCw, X } from "lucide-react";
import { formatBytes } from "yunidesk";
import { useMessenger } from "../../state/context";
import type { Uploads } from "../../hooks/useUploads";
import { cn } from "../../lib/cn";

/** Files waiting in the composer, with upload progress. */
export function AttachmentChips({ uploads }: { uploads: Uploads }) {
  const { strings } = useMessenger();
  if (uploads.items.length === 0) return null;
  return (
    <ul className="flex gap-2 overflow-x-auto px-2.5 pt-3 pb-1">
      {uploads.items.map((item) => (
        <li key={item.key} className="ys-pop relative shrink-0">
          <div
            className={cn(
              "relative flex h-14 items-center gap-2 overflow-hidden rounded-xl bg-surface",
              item.previewUrl ? "w-14" : "max-w-[200px] pr-7 pl-2.5",
              item.status === "error" && "bg-danger-soft",
            )}
          >
            {item.previewUrl ? (
              <img src={item.previewUrl} alt="" className="size-full object-cover" draggable={false} />
            ) : (
              <>
                <FileText className="size-5 shrink-0 text-ink" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{item.name}</span>
                  <span className="block text-[11px] text-muted">
                    {item.status === "uploading" ? strings.uploading : item.status === "error" ? strings.uploadFailed : formatBytes(item.size)}
                  </span>
                </span>
              </>
            )}
            {item.status === "uploading" && (
              <span
                role="progressbar"
                aria-label={`${strings.uploading} ${item.name}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(item.progress * 100)}
                className="absolute inset-x-1.5 bottom-1.5 h-1 overflow-hidden rounded-full bg-black/15"
              >
                <span className="block h-full rounded-full bg-brand transition-[width] duration-200" style={{ width: `${Math.max(6, item.progress * 100)}%` }} />
              </span>
            )}
            {item.status === "error" && (
              <button
                type="button"
                onClick={() => uploads.retry(item.key)}
                aria-label={`${strings.retry} ${item.name}`}
                title={strings.uploadFailed}
                className={cn("flex cursor-pointer items-center justify-center text-danger", item.previewUrl && "absolute inset-0 bg-black/40 text-white")}
              >
                {item.previewUrl ? <RotateCw className="size-5" aria-hidden="true" /> : <AlertCircle className="size-4" aria-hidden="true" />}
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => uploads.remove(item.key)}
            aria-label={`${strings.removeAttachment} ${item.name}`}
            className="absolute -top-1.5 -right-1.5 flex size-5 cursor-pointer items-center justify-center rounded-full bg-fg text-surface shadow-card transition-transform hover:scale-110"
          >
            <X className="size-3" strokeWidth={3} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

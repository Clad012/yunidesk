import { UploadIcon } from "lucide-react";
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { copy } from "@/lib/copy";

/** Accepts dropped files anywhere over the composer, with a calm overlay while dragging. */
export function DropZone({ onFiles, children }: { onFiles: (files: File[]) => void; children: ReactNode }) {
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");

  return (
    <div
      className="relative"
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current += 1;
        setOver(true);
      }}
      onDragOver={(e) => hasFiles(e) && e.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setOver(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        onFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {children}
      {over ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary bg-primary/8 text-sm font-medium text-primary backdrop-blur-[1px]">
          <UploadIcon className="size-4" /> {copy.composer.drop}
        </div>
      ) : null}
    </div>
  );
}

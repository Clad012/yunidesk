import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon } from "lucide-react";
import { useRef } from "react";
import type { Attachment } from "yunidesk";
import { copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

interface LightboxProps {
  images: Attachment[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
}

export function Lightbox({ images, index, onIndexChange }: LightboxProps) {
  const current = index === null ? null : (images[index] ?? null);
  // Keep showing the last image while the dialog animates out.
  const last = useRef<Attachment | null>(null);
  if (current) last.current = current;
  const image = current ?? last.current;
  const step = (delta: number) => index !== null && onIndexChange((index + delta + images.length) % images.length);
  return (
    <Dialog open={current != null} onOpenChange={(open) => !open && onIndexChange(null)}>
      <DialogContent
        showClose={false}
        className="flex max-h-[92vh] w-auto max-w-[92vw] flex-col items-center gap-3 border-none bg-transparent p-0 shadow-none sm:max-w-[92vw]"
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") step(1);
          if (e.key === "ArrowLeft") step(-1);
        }}
      >
        <DialogTitle className="sr-only">{image?.fileName}</DialogTitle>
        <DialogDescription className="sr-only">{image?.fileName}</DialogDescription>
        {image ? <img src={image.url} alt={image.fileName} className="max-h-[80vh] max-w-full rounded-xl object-contain shadow-2xl" /> : null}
        <div className="flex items-center gap-2 rounded-full bg-black/60 px-2 py-1 text-white backdrop-blur">
          {images.length > 1 ? (
            <Button size="icon-xs" variant="ghost" className="text-white hover:bg-white/15 hover:text-white" onClick={() => step(-1)} aria-label={copy.conversation.previousImage}>
              <ChevronLeftIcon />
            </Button>
          ) : null}
          <span className="max-w-64 truncate px-1 text-xs">{image?.fileName}</span>
          {images.length > 1 ? (
            <Button size="icon-xs" variant="ghost" className="text-white hover:bg-white/15 hover:text-white" onClick={() => step(1)} aria-label={copy.conversation.nextImage}>
              <ChevronRightIcon />
            </Button>
          ) : null}
          {image ? (
            <Button asChild size="icon-xs" variant="ghost" className="text-white hover:bg-white/15 hover:text-white">
              <a href={image.url} download={image.fileName} target="_blank" rel="noreferrer" aria-label={copy.conversation.download}>
                <DownloadIcon />
              </a>
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

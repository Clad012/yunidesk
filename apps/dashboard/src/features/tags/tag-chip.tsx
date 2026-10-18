import { XIcon } from "lucide-react";
import type { Tag } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { TAG_COLOR_CLASSES } from "./tag-colors";

interface TagChipProps {
  tag: Pick<Tag, "name" | "color">;
  size?: "xs" | "sm";
  onRemove?: () => void;
  className?: string;
}

export function TagChip({ tag, size = "sm", onRemove, className }: TagChipProps) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full min-w-0 items-center gap-1 rounded-md font-medium",
        size === "xs" ? "h-4 px-1 text-[10px]" : "h-6 px-1.5 text-xs",
        TAG_COLOR_CLASSES[tag.color].chip,
        className,
      )}
    >
      <span className="truncate">{tag.name}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="-mr-0.5 rounded-sm opacity-60 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none"
          aria-label={fmt(copy.tags.remove, { name: tag.name })}
        >
          <XIcon className="size-3" />
        </button>
      ) : null}
    </span>
  );
}

export function TagDot({ color, className }: { color: Tag["color"]; className?: string }) {
  return <span className={cn("size-2 shrink-0 rounded-full", TAG_COLOR_CLASSES[color].dot, className)} aria-hidden />;
}

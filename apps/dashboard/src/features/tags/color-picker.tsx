import { CheckIcon } from "lucide-react";
import { TAG_COLORS, type TagColor } from "yunidesk";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { TAG_COLOR_CLASSES } from "./tag-colors";

/** The fixed tag palette, as a row of swatches. */
export function ColorPicker({ value, onChange }: { value: TagColor; onChange: (color: TagColor) => void }) {
  return (
    <div role="radiogroup" aria-label={copy.tags.color} className="flex flex-wrap gap-1.5">
      {TAG_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={copy.tags[`color_${color}`]}
          onClick={() => onChange(color)}
          className={cn(
            "flex size-6 items-center justify-center rounded-full outline-none ring-offset-2 ring-offset-popover transition-shadow focus-visible:ring-2 focus-visible:ring-ring",
            TAG_COLOR_CLASSES[color].dot,
            value === color && "ring-2 ring-foreground/70",
          )}
        >
          {value === color ? <CheckIcon className="size-3.5 text-white" /> : null}
        </button>
      ))}
    </div>
  );
}

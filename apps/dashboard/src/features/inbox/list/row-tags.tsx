import type { Tag } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { TagChip } from "@/features/tags/tag-chip";

const SHOWN = 3;

/** A conversation's tags on its list row: the first few, then "+n". */
export function RowTags({ tags }: { tags: Tag[] }) {
  const hidden = tags.length - SHOWN;
  return (
    <div className="mt-0.5 flex min-w-0 items-center gap-1 overflow-hidden">
      {tags.slice(0, SHOWN).map((tag) => (
        <TagChip key={tag.id} tag={tag} size="xs" className="max-w-24" />
      ))}
      {hidden > 0 ? (
        <span className="shrink-0 text-[10px] text-muted-foreground" title={tags.slice(SHOWN).map((t) => t.name).join(", ")}>
          {fmt(copy.tags.more, { n: hidden })}
        </span>
      ) : null}
    </div>
  );
}

import { copy, fmt } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { TagDot } from "@/features/tags/tag-chip";
import { useTags } from "@/features/tags/use-tags";
import { useInboxParams } from "../lib/use-inbox-params";
import { useSetFilters } from "../lib/use-set-filters";

/** Tags with their open-conversation counts; picking one filters the current view. */
export function TagsNav() {
  const tags = useTags();
  const { filters } = useInboxParams();
  const setFilters = useSetFilters();
  const items = tags.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <nav className="flex min-h-0 flex-col gap-0.5" aria-label={copy.tags.title}>
      <p className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">{copy.tags.title}</p>
      <div className="-mr-1 flex max-h-64 flex-col gap-0.5 overflow-y-auto pr-1 scrollbar-thin">
        {items.map((tag) => {
          const active = filters.tag === tag.id;
          return (
            <button
              key={tag.id}
              type="button"
              aria-pressed={active}
              title={active ? copy.tags.clearFilter : fmt(copy.tags.filterTitle, { name: tag.name })}
              onClick={() => setFilters({ tag: active ? null : tag.id })}
              className={cn(
                "flex h-8 shrink-0 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
                active && "bg-card font-medium text-foreground shadow-xs",
              )}
            >
              <TagDot color={tag.color} className="mx-1" />
              <span className="flex-1 truncate">{tag.name}</span>
              {tag.openCount > 0 ? <span className="text-xs text-muted-foreground tabular-nums">{tag.openCount}</span> : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

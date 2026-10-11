import type { KnowledgeItem } from "yunidesk";
import { LibraryIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { copy, fmt } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "../../confirm-dialog";
import { SettingsCard } from "../../settings-page";
import { KnowledgeDialog } from "./knowledge-dialog";
import { KnowledgeRow } from "./knowledge-row";
import { useKnowledge } from "./use-knowledge";

export function KnowledgeCard({ editable }: { editable: boolean }) {
  const [search, setSearch] = useState("");
  const q = useDebouncedValue(search.trim());
  const { list, save, remove } = useKnowledge(q);
  const [editing, setEditing] = useState<KnowledgeItem | "new" | null>(null);
  // Keeps its item while the dialog closes, so the text doesn't blank mid-animation.
  const [deleting, setDeleting] = useState<{ item: KnowledgeItem; open: boolean } | null>(null);
  const items = list.data?.items ?? [];
  const open = (target: KnowledgeItem | "new") => (save.reset(), setEditing(target));

  return (
    <SettingsCard title={copy.knowledge.title} description={copy.knowledge.description}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-48 flex-1">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input type="search" aria-label={copy.knowledge.search} placeholder={copy.knowledge.search} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
        </div>
        {editable ? (
          <Button size="sm" onClick={() => open("new")}>
            <PlusIcon /> {copy.knowledge.add}
          </Button>
        ) : null}
      </div>
      {list.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-lg bg-muted/50 px-6 py-6 text-center text-sm text-muted-foreground">
          <LibraryIcon className="size-5" />
          <p className="font-medium text-foreground">{q ? fmt(copy.knowledge.emptySearch, { q }) : copy.knowledge.empty}</p>
          {q ? null : <p className="max-w-md">{copy.knowledge.emptyHint}</p>}
        </div>
      ) : (
        <ul className="-my-3 divide-y">
          {items.map((item) => (
            <KnowledgeRow key={item.id} item={item} editable={editable} onEdit={() => open(item)} onDelete={() => setDeleting({ item, open: true })} />
          ))}
        </ul>
      )}
      {editing ? (
        <KnowledgeDialog
          key={editing === "new" ? "new" : editing.id}
          initial={editing === "new" ? null : editing}
          saving={save.isPending}
          error={save.error ? errorMessage(save.error, copy.common.somethingWrong) : null}
          onClose={() => setEditing(null)}
          onSave={(body) => save.mutate({ id: editing === "new" ? null : editing.id, body }, { onSuccess: () => setEditing(null) })}
        />
      ) : null}
      <ConfirmDialog
        open={deleting?.open ?? false}
        title={copy.knowledge.deleteTitle}
        body={deleting?.item.title ?? ""}
        action={copy.common.delete}
        destructive
        onOpenChange={(o) => !o && setDeleting((d) => (d ? { ...d, open: false } : d))}
        onConfirm={() => deleting && remove.mutate(deleting.item.id)}
      />
    </SettingsCard>
  );
}

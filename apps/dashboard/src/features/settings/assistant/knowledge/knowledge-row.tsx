import type { KnowledgeItem } from "yunidesk";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { copy, fmt } from "@/lib/copy";
import { formatDateTime } from "@/lib/time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const firstLine = (text: string) => text.split("\n").find((line) => line.trim() !== "")?.trim() ?? "";

interface KnowledgeRowProps {
  item: KnowledgeItem;
  editable: boolean;
  onEdit: () => void;
  onDelete: () => void;
}

export function KnowledgeRow({ item, editable, onEdit, onDelete }: KnowledgeRowProps) {
  return (
    <li className="flex items-start gap-3 py-3">
      <Badge variant={item.kind === "faq" ? "default" : "secondary"} className="mt-0.5 w-16">
        {copy.knowledge[`kind_${item.kind}`]}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="truncate text-sm text-muted-foreground">{firstLine(item.body)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{fmt(copy.knowledge.updated, { time: formatDateTime(item.updatedAt) })}</p>
      </div>
      {editable ? (
        <>
          <Button size="icon-xs" variant="ghost" aria-label={copy.common.edit} onClick={onEdit}>
            <PencilIcon />
          </Button>
          <Button size="icon-xs" variant="ghost" aria-label={copy.common.delete} className="text-destructive hover:text-destructive" onClick={onDelete}>
            <Trash2Icon />
          </Button>
        </>
      ) : null}
    </li>
  );
}

import type { AssistantTool } from "yunidesk";
import { PlusIcon, WrenchIcon } from "lucide-react";
import { useState } from "react";
import { copy, fmt } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "../../confirm-dialog";
import { SettingsCard } from "../../settings-page";
import { ToolDialog } from "./tool-dialog";
import { ToolRow } from "./tool-row";
import { ToolSigning } from "./tool-signing";
import { useAssistantTools } from "./use-assistant-tools";

export function ToolsCard({ editable }: { editable: boolean }) {
  const { list, save, toggle, remove, roll } = useAssistantTools();
  const [editing, setEditing] = useState<AssistantTool | "new" | null>(null);
  // Keeps its tool while the dialog closes, so the text doesn't blank mid-animation.
  const [deleting, setDeleting] = useState<{ tool: AssistantTool; open: boolean } | null>(null);
  const items = list.data?.items ?? [];
  const open = (target: AssistantTool | "new") => (save.reset(), setEditing(target));

  return (
    <SettingsCard title={copy.assistantTools.title} description={copy.assistantTools.description}>
      {editable ? (
        <div>
          <Button size="sm" onClick={() => open("new")}>
            <PlusIcon /> {copy.assistantTools.add}
          </Button>
        </div>
      ) : null}
      {list.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 rounded-lg bg-muted/50 px-6 py-6 text-center text-sm text-muted-foreground">
          <WrenchIcon className="size-5" />
          <p className="font-medium text-foreground">{copy.assistantTools.empty}</p>
          <p className="max-w-md">{copy.assistantTools.emptyHint}</p>
        </div>
      ) : (
        <ul className="-my-3 divide-y">
          {items.map((tool) => (
            <ToolRow
              key={tool.id}
              tool={tool}
              editable={editable}
              toggling={toggle.isPending && toggle.variables.id === tool.id}
              onToggle={(enabled) => toggle.mutate({ id: tool.id, enabled })}
              onEdit={() => open(tool)}
              onDelete={() => setDeleting({ tool, open: true })}
            />
          ))}
        </ul>
      )}
      <ToolSigning editable={editable} rolling={roll.isPending} onRoll={(onSecret) => roll.mutate(undefined, { onSuccess: (r) => onSecret(r.secret) })} />
      {editing ? (
        <ToolDialog
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
        title={copy.assistantTools.deleteTitle}
        body={fmt(copy.assistantTools.deleteBody, { name: deleting?.tool.name ?? "" })}
        action={copy.common.delete}
        destructive
        onOpenChange={(o) => !o && setDeleting((d) => (d ? { ...d, open: false } : d))}
        onConfirm={() => deleting && remove.mutate(deleting.tool.id)}
      />
    </SettingsCard>
  );
}

import type { AssistantTool } from "yunidesk";
import { GlobeIcon, PencilIcon, Trash2Icon } from "lucide-react";
import { copy, fmt } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { urlHost } from "./tool-rules";

interface ToolRowProps {
  tool: AssistantTool;
  editable: boolean;
  toggling: boolean;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function ToolRow({ tool, editable, toggling, onToggle, onEdit, onDelete }: ToolRowProps) {
  return (
    <li className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <code className="font-mono text-xs font-medium">{tool.name}</code>
        <p className="line-clamp-2 text-sm text-muted-foreground">{tool.description}</p>
        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground" title={tool.url}>
          <GlobeIcon className="size-3" /> {urlHost(tool.url)}
        </p>
      </div>
      <Switch checked={tool.enabled} disabled={!editable || toggling} onCheckedChange={onToggle} aria-label={fmt(copy.assistantTools.toggle, { name: tool.name })} className="mt-0.5" />
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

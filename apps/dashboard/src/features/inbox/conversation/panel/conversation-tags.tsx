import type { AgentConversation } from "yunidesk";
import { copy } from "@/lib/copy";
import { TagChip } from "@/features/tags/tag-chip";
import { TagPicker } from "./tag-picker";
import { useTagActions } from "./use-tag-actions";

/** The conversation's tags; `editable` false (viewers) shows them without the picker or remove buttons. */
export function ConversationTags({ conversation, editable }: { conversation: AgentConversation; editable: boolean }) {
  const actions = useTagActions(conversation);
  if (!editable && conversation.tags.length === 0) return <p className="text-xs text-muted-foreground">{copy.tags.none}</p>;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {conversation.tags.map((tag) => (
        <TagChip key={tag.id} tag={tag} onRemove={editable ? () => actions.remove(tag.id) : undefined} />
      ))}
      {editable ? <TagPicker attached={conversation.tags} onAdd={actions.add} onCreate={actions.create} /> : null}
    </div>
  );
}

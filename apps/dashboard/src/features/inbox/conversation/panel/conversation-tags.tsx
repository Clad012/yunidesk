import type { AgentConversation } from "yunidesk";
import { TagChip } from "@/features/tags/tag-chip";
import { TagPicker } from "./tag-picker";
import { useTagActions } from "./use-tag-actions";

export function ConversationTags({ conversation }: { conversation: AgentConversation }) {
  const actions = useTagActions(conversation);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {conversation.tags.map((tag) => (
        <TagChip key={tag.id} tag={tag} onRemove={() => actions.remove(tag.id)} />
      ))}
      <TagPicker attached={conversation.tags} onAdd={actions.add} onCreate={actions.create} />
    </div>
  );
}

import { MessagesSquareIcon } from "lucide-react";
import { copy } from "@/lib/copy";
import { BlurFade } from "@/components/magicui/blur-fade";
import { Kbd } from "@/components/ui/kbd";

export function ConversationEmpty() {
  return (
    <BlurFade className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <MessagesSquareIcon className="size-5" />
      </span>
      <p className="font-medium">{copy.conversation.pickOne}</p>
      <p className="flex items-center gap-1 text-sm text-muted-foreground">
        <Kbd>j</Kbd> <Kbd>k</Kbd> · {copy.conversation.pickOneHint}
      </p>
    </BlurFade>
  );
}

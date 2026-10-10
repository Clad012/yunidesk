import { useQuery } from "@tanstack/react-query";
import { MessageSquareTextIcon } from "lucide-react";
import type { ReactNode } from "react";
import { copy } from "@/lib/copy";
import { endpoints, queryKeys } from "@/lib/endpoints";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";

interface SavedRepliesPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (body: string) => void;
  children: ReactNode;
}

/** "/" in an empty composer: search saved replies by shortcut, title or text. */
export function SavedRepliesPicker({ open, onOpenChange, onPick, children }: SavedRepliesPickerProps) {
  const canned = useQuery({ queryKey: queryKeys.canned, queryFn: endpoints.canned, enabled: open, staleTime: 60_000 });
  const items = canned.data?.items ?? [];
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent align="start" side="top" className="w-96 p-0" onCloseAutoFocus={(e) => e.preventDefault()}>
        <Command>
          <CommandInput placeholder={copy.composer.savedRepliesSearch} autoFocus />
          <CommandList>
            <CommandEmpty>{canned.isPending ? copy.common.loading : copy.composer.savedRepliesEmpty}</CommandEmpty>
            {items.length > 0 ? (
              <CommandGroup heading={copy.composer.savedReplies}>
                {items.map((item) => (
                  <CommandItem key={item.id} value={`${item.shortcut} ${item.title} ${item.body}`} onSelect={() => onPick(item.body)} className="items-start">
                    <MessageSquareTextIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="truncate font-medium">{item.title}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">/{item.shortcut}</span>
                      </span>
                      <span className="line-clamp-2 text-xs text-muted-foreground">{item.body}</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

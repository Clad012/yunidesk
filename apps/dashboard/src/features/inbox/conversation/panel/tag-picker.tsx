import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { MAX_TAG_NAME_LENGTH, TAG_COLORS, type Tag, type TagColor } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ColorPicker } from "@/features/tags/color-picker";
import { TagDot } from "@/features/tags/tag-chip";
import { useTags } from "@/features/tags/use-tags";

interface TagPickerProps {
  attached: Tag[];
  onAdd: (tag: Tag) => void;
  onCreate: (name: string, color: TagColor) => void;
}

/** Type to search the team's tags; a new name can be created on the spot, with a colour. */
export function TagPicker({ attached, onAdd, onCreate }: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const tags = useTags();
  const all = tags.data?.items ?? [];
  const [color, setColor] = useState<TagColor>("blue");
  const attachedIds = new Set(attached.map((t) => t.id));
  const name = search.replace(/\s+/g, " ").trim().slice(0, MAX_TAG_NAME_LENGTH);
  const exists = all.some((t) => t.name.toLowerCase() === name.toLowerCase());
  const creatable = name.length > 0 && !exists;
  const close = () => (setOpen(false), setSearch(""));

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setColor(TAG_COLORS[1 + (all.length % (TAG_COLORS.length - 1))] ?? "blue");
    else setSearch("");
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" className="text-muted-foreground">
          <PlusIcon /> {copy.tags.add}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder={copy.tags.search} value={search} onValueChange={setSearch} maxLength={MAX_TAG_NAME_LENGTH + 20} />
          <CommandList>
            {creatable ? null : <CommandEmpty>{tags.isPending ? copy.common.loading : copy.tags.none}</CommandEmpty>}
            <CommandGroup>
              {all
                .filter((t) => !attachedIds.has(t.id))
                .map((tag) => (
                  <CommandItem key={tag.id} value={tag.name} onSelect={() => (onAdd(tag), close())}>
                    <TagDot color={tag.color} />
                    <span className="flex-1 truncate">{tag.name}</span>
                  </CommandItem>
                ))}
            </CommandGroup>
            {creatable ? (
              <CommandGroup forceMount>
                <CommandItem forceMount value={`__create ${name}`} onSelect={() => (onCreate(name, color), close())}>
                  <TagDot color={color} />
                  <span className="flex-1 truncate">{fmt(copy.tags.create, { name })}</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
          {creatable ? (
            <div className="flex flex-col gap-2 border-t p-3">
              <p className="text-xs font-medium text-muted-foreground">{copy.tags.color}</p>
              <ColorPicker value={color} onChange={setColor} />
            </div>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  );
}

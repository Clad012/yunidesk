import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { browserTimeZone, timeZones } from "./hours-edit";

interface TimezonePickerProps {
  id: string;
  value: string;
  disabled: boolean;
  onChange: (zone: string) => void;
}

/** Searchable list of IANA zones, the browser's own first. */
export function TimezonePicker({ id, value, disabled, onChange }: TimezonePickerProps) {
  const [open, setOpen] = useState(false);
  const own = useMemo(browserTimeZone, []);
  const zones = useMemo(() => timeZones().filter((zone) => zone !== own), [own]);
  const pick = (zone: string) => {
    onChange(zone);
    setOpen(false);
  };
  const item = (zone: string) => (
    <CommandItem key={zone} value={zone} onSelect={() => pick(zone)}>
      <CheckIcon className={cn("size-4", zone === value ? "opacity-100" : "opacity-0")} />
      <span className="truncate">{zone.replaceAll("_", " ")}</span>
    </CommandItem>
  );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button id={id} type="button" variant="outline" role="combobox" aria-expanded={open} disabled={disabled} className="w-full justify-between font-normal sm:w-80">
          <span className="truncate">{value.replaceAll("_", " ")}</span>
          <ChevronsUpDownIcon className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-0">
        <Command>
          <CommandInput placeholder={copy.businessHours.timezoneSearch} />
          <CommandList>
            <CommandEmpty>{copy.businessHours.timezoneEmpty}</CommandEmpty>
            <CommandGroup heading={copy.businessHours.yourZone}>{item(own)}</CommandGroup>
            <CommandGroup heading={copy.businessHours.timezone}>{zones.map(item)}</CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

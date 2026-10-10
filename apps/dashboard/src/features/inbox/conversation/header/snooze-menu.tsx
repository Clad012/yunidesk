import { AlarmClockIcon, CalendarClockIcon } from "lucide-react";
import { useState } from "react";
import { copy } from "@/lib/copy";
import { snoozeUntil, type SnoozePreset } from "@/lib/snooze";
import { formatShortUntil } from "@/lib/time";
import { Button } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CustomSnoozeDialog } from "./custom-snooze-dialog";

const PRESETS: { preset: SnoozePreset; label: string }[] = [
  { preset: "hour", label: copy.conversation.snoozeHour },
  { preset: "tomorrow", label: copy.conversation.snoozeTomorrow },
  { preset: "nextWeek", label: copy.conversation.snoozeNextWeek },
];

export function SnoozeMenu({ onSnooze, disabled }: { onSnooze: (until: number) => void; disabled?: boolean }) {
  const [customOpen, setCustomOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <Tip label={copy.conversation.snooze}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={copy.conversation.snooze} disabled={disabled}>
              <AlarmClockIcon />
            </Button>
          </DropdownMenuTrigger>
        </Tip>
        <DropdownMenuContent align="end" className="w-64" onCloseAutoFocus={(e) => e.preventDefault()}>
          {PRESETS.map(({ preset, label }) => {
            const until = snoozeUntil(preset);
            return (
              <DropdownMenuItem key={preset} onSelect={() => onSnooze(snoozeUntil(preset))}>
                <span className="flex-1 whitespace-nowrap">{label}</span>
                <DropdownMenuShortcut className="whitespace-nowrap">{formatShortUntil(until)}</DropdownMenuShortcut>
              </DropdownMenuItem>
            );
          })}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCustomOpen(true)}>
            <CalendarClockIcon /> {copy.conversation.snoozeCustom}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CustomSnoozeDialog open={customOpen} onOpenChange={setCustomOpen} onSnooze={onSnooze} />
    </>
  );
}

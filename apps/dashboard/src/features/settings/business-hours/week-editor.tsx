import { CopyIcon } from "lucide-react";
import type { BusinessHours } from "yunidesk";
import { copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "../settings-page";
import { DayRow } from "./day-row";
import { WEEK_ORDER, copyMondayToWeekdays, rangesOf, withRanges } from "./hours-edit";

interface WeekEditorProps {
  hours: BusinessHours;
  disabled: boolean;
  onChange: (hours: BusinessHours) => void;
}

export function WeekEditor({ hours, disabled, onChange }: WeekEditorProps) {
  return (
    <SettingsCard title={copy.businessHours.week} description={copy.businessHours.weekHint}>
      <div className="-my-3 divide-y">
        {WEEK_ORDER.map((day) => (
          <DayRow
            key={day}
            day={day}
            ranges={rangesOf(hours, day)}
            disabled={disabled}
            onChange={(ranges) => onChange(withRanges(hours, day, ranges))}
            action={
              day === 1 ? (
                <Button type="button" variant="ghost" size="xs" onClick={() => onChange(copyMondayToWeekdays(hours))}>
                  <CopyIcon /> {copy.businessHours.copyMonday}
                </Button>
              ) : undefined
            }
          />
        ))}
      </div>
    </SettingsCard>
  );
}

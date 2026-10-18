import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import type { BusinessHours } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingsCard } from "../settings-page";
import { addHoliday, type HolidayProblem } from "./hours-edit";

const label = new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
/** "2026-12-25" read as a calendar day, whatever the browser's zone. */
const formatDay = (date: string) => label.format(Date.parse(`${date}T00:00:00Z`));

interface HolidaysEditorProps {
  hours: BusinessHours;
  disabled: boolean;
  onChange: (hours: BusinessHours) => void;
}

export function HolidaysEditor({ hours, disabled, onChange }: HolidaysEditorProps) {
  const [date, setDate] = useState("");
  const [problem, setProblem] = useState<HolidayProblem>(null);
  const add = () => {
    const result = addHoliday(hours, date);
    setProblem(result.problem);
    if (result.problem) return;
    onChange(result.hours);
    setDate("");
  };
  return (
    <SettingsCard title={copy.businessHours.holidays} description={copy.businessHours.holidaysHint}>
      {!disabled ? (
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (date) add();
          }}
        >
          <div className="flex items-center gap-2">
            <Input type="date" aria-label={copy.businessHours.addHoliday} value={date} onChange={(e) => {
                setDate(e.target.value);
                setProblem(null);
              }} className="w-44" />
            <Button type="submit" variant="outline" size="sm" disabled={!date}>
              <PlusIcon /> {copy.businessHours.addHoliday}
            </Button>
          </div>
          {problem ? (
            <p className="text-xs text-destructive">{problem === "taken" ? copy.businessHours.holidayTaken : copy.businessHours.holidaysFull}</p>
          ) : null}
        </form>
      ) : null}
      {hours.holidays.length === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.businessHours.noHolidays}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {hours.holidays.map((day) => (
            <li key={day} className="flex items-center gap-1 rounded-lg bg-muted py-1 pr-1 pl-2.5 text-sm">
              <time dateTime={day}>{formatDay(day)}</time>
              {!disabled ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={fmt(copy.businessHours.removeHoliday, { date: formatDay(day) })}
                  onClick={() => onChange({ ...hours, holidays: hours.holidays.filter((d) => d !== day) })}
                >
                  <XIcon />
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}

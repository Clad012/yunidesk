import { CHANNELS } from "yunidesk";
import { copy, fmt } from "@/lib/copy";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTags } from "@/features/tags/use-tags";
import { useTeams } from "@/features/teams/use-teams";
import { browserTimeZone, isValidRange, presetRange, RANGE_PRESETS, todayIn, type RangePreset } from "./lib/range";
import type { ReportParams } from "./use-report-params";

const ANY = "any";

function FilterSelect({ label, value, onChange, options, anyLabel }: {
  label: string;
  value: string | undefined;
  onChange: (value: string | null) => void;
  options: { value: string; label: string }[];
  anyLabel: string;
}) {
  return (
    <Select value={value ?? ANY} onValueChange={(v) => onChange(v === ANY ? null : v)}>
      <SelectTrigger aria-label={label} className="h-8 w-auto min-w-36">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY}>{anyLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function CustomRange({ params }: { params: ReportParams }) {
  const { search, setSearch } = params;
  const invalid = Boolean(search.from && search.to && !isValidRange(search.from, search.to));
  const input = "h-8 rounded-lg border border-input bg-card px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40";
  return (
    <span className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-1.5 text-muted-foreground">
        {copy.reports.from}
        <input type="date" value={search.from ?? ""} max={search.to} onChange={(e) => setSearch({ from: e.target.value || null })} className={input} />
      </label>
      <label className="flex items-center gap-1.5 text-muted-foreground">
        {copy.reports.to}
        <input type="date" value={search.to ?? ""} min={search.from} onChange={(e) => setSearch({ to: e.target.value || null })} className={input} />
      </label>
      {invalid ? <span role="alert" className="text-xs text-destructive">{copy.reports.invalidRange}</span> : null}
    </span>
  );
}

/** One row above everything it scopes: period first, then channel, tag and assignee. */
export function ReportFilters({ params }: { params: ReportParams }) {
  const { search, preset, setSearch } = params;
  const { teammates } = useBootstrap();
  const tags = useTags();
  const teams = useTeams();
  const choosePreset = (value: string) => {
    if (value !== "custom") return setSearch({ range: value === "7d" ? null : value, from: null, to: null });
    // Start the custom range from what is on screen.
    const current = presetRange(preset === "custom" ? "7d" : preset, todayIn(browserTimeZone()));
    setSearch({ range: "custom", from: search.from ?? current.from, to: search.to ?? current.to });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={preset} onValueChange={choosePreset}>
        <SelectTrigger aria-label={copy.reports.period} className="h-8 w-auto min-w-36 font-medium">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {[...RANGE_PRESETS, "custom" as const].map((p: RangePreset) => (
            <SelectItem key={p} value={p}>{copy.reports[`preset_${p}`]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {preset === "custom" ? <CustomRange params={params} /> : null}
      <FilterSelect
        label={copy.reports.channel}
        value={search.channel}
        onChange={(channel) => setSearch({ channel })}
        anyLabel={copy.reports.anyChannel}
        options={CHANNELS.map((c) => ({ value: c, label: copy.list[`channel_${c}`] }))}
      />
      <FilterSelect
        label={copy.reports.tag}
        value={search.tag}
        onChange={(tag) => setSearch({ tag })}
        anyLabel={copy.reports.anyTag}
        options={(tags.data?.items ?? []).map((t) => ({ value: t.id, label: t.name }))}
      />
      <FilterSelect
        label={copy.reports.assignee}
        value={search.assignee}
        onChange={(assignee) => setSearch({ assignee })}
        anyLabel={copy.reports.anyAssignee}
        options={[{ value: "none", label: copy.reports.unassigned }, ...teammates.map((t) => ({ value: t.id, label: t.name }))]}
      />
      {teams.data?.items.length ? (
        <FilterSelect
          label={copy.reports.team}
          value={search.team}
          onChange={(team) => setSearch({ team })}
          anyLabel={copy.reports.anyTeam}
          options={teams.data.items.map((t) => ({ value: t.id, label: t.name }))}
        />
      ) : null}
      <span className="ml-auto text-xs text-muted-foreground">{fmt(copy.reports.timeZone, { tz: browserTimeZone() })}</span>
    </div>
  );
}

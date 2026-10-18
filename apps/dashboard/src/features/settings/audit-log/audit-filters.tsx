import { DownloadIcon } from "lucide-react";
import { AUDIT_ACTIONS, AUDIT_CATEGORIES } from "yunidesk";
import { copy } from "@/lib/copy";
import { endpoints, type TeamMember } from "@/lib/endpoints";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AuditFilters } from "./use-audit-log";

const ALL = "all";

interface AuditFiltersBarProps {
  filters: AuditFilters;
  people: TeamMember[];
  onChange: (next: AuditFilters) => void;
}

/** Action (a group or one action) and person filters, plus the CSV export of what's shown. */
export function AuditFiltersBar({ filters, people, onChange }: AuditFiltersBarProps) {
  const exportFilters = { action: filters.action || undefined, actor: filters.actor || undefined };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={filters.action || ALL} onValueChange={(v) => onChange({ ...filters, action: v === ALL ? "" : v })}>
        <SelectTrigger className="w-60" aria-label={copy.audit.actionFilter}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          <SelectItem value={ALL}>{copy.audit.allActions}</SelectItem>
          {AUDIT_CATEGORIES.map((category) => [
            <SelectItem key={category} value={category} className="font-medium">
              {copy.audit.categories[category]}
            </SelectItem>,
            ...AUDIT_ACTIONS.filter((a) => a.startsWith(`${category}.`)).map((action) => (
              <SelectItem key={action} value={action} className="pl-6 text-muted-foreground">
                {copy.audit.actions[action]}
              </SelectItem>
            )),
          ])}
        </SelectContent>
      </Select>
      <Select value={filters.actor || ALL} onValueChange={(v) => onChange({ ...filters, actor: v === ALL ? "" : v })}>
        <SelectTrigger className="w-48" aria-label={copy.audit.actorFilter}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          <SelectItem value={ALL}>{copy.audit.allPeople}</SelectItem>
          {people.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button asChild variant="outline" size="sm" className="ml-auto">
        <a href={endpoints.auditLogExportUrl(exportFilters)} download>
          <DownloadIcon /> {copy.audit.exportCsv}
        </a>
      </Button>
    </div>
  );
}

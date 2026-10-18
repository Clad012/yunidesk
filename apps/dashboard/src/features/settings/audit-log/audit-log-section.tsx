import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { copy } from "@/lib/copy";
import { errorMessage } from "@/lib/api";
import { endpoints, queryKeys } from "@/lib/endpoints";
import { useCan } from "@/hooks/use-bootstrap";
import { Field } from "@/components/field";
import { Input } from "@/components/ui/input";
import { SaveBar, SettingsCard, SettingsPage } from "../settings-page";
import { useSettingsForm } from "../use-settings-form";
import { AuditFiltersBar } from "./audit-filters";
import { AuditTable } from "./audit-table";
import { useAuditLog, type AuditFilters } from "./use-audit-log";

export function AuditLogSection() {
  const canRead = useCan("auditLog.read");
  const [filters, setFilters] = useState<AuditFilters>({ action: "", actor: "" });
  const { query, items } = useAuditLog(filters, canRead);
  const team = useQuery({ queryKey: queryKeys.team, queryFn: endpoints.team, enabled: canRead });

  if (!canRead) {
    return (
      <SettingsPage title={copy.audit.title} subtitle={copy.audit.subtitle}>
        <p className="text-sm text-muted-foreground">{copy.audit.locked}</p>
      </SettingsPage>
    );
  }
  return (
    <SettingsPage title={copy.audit.title} subtitle={copy.audit.subtitle}>
      <SettingsCard>
        <AuditFiltersBar filters={filters} people={team.data?.agents ?? []} onChange={setFilters} />
        <AuditTable
          items={items}
          loading={query.isPending}
          error={query.isError ? errorMessage(query.error, copy.common.somethingWrong) : null}
          filtered={Boolean(filters.action || filters.actor)}
          hasMore={query.hasNextPage}
          loadingMore={query.isFetchingNextPage}
          onMore={() => void query.fetchNextPage()}
          onRetry={() => void query.refetch()}
        />
      </SettingsCard>
      <AuditRetention />
    </SettingsPage>
  );
}

function AuditRetention() {
  const form = useSettingsForm(["auditRetentionDays"] as const);
  const days = form.value.auditRetentionDays;
  const valid = Number.isInteger(days) && days >= 30 && days <= 3650;
  return (
    <SettingsCard>
      <Field label={copy.audit.retention} hint={copy.audit.retentionHint} error={valid ? null : copy.audit.retentionHint}>
        {(id) => (
          <div className="flex items-center gap-2">
            <Input id={id} type="number" min={30} max={3650} step={1} value={Number.isFinite(days) ? days : ""} disabled={!form.canEdit} onChange={(e) => form.set("auditRetentionDays", e.target.valueAsNumber)} className="w-28 tabular-nums" />
            <span className="text-sm text-muted-foreground">{copy.privacy.retentionUnit}</span>
          </div>
        )}
      </Field>
      <SaveBar dirty={form.dirty && valid} saving={form.saving} onSave={form.save} onDiscard={form.discard} />
    </SettingsCard>
  );
}

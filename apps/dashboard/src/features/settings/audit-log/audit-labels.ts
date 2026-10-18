import { AGENT_ROLES, type AgentRole, type AuditEntry } from "yunidesk";
import { copy } from "@/lib/copy";

const isRole = (value: unknown): value is AgentRole => typeof value === "string" && (AGENT_ROLES as readonly string[]).includes(value);
const text = (value: unknown): string | null => (typeof value === "string" && value ? value : null);

export function actionLabel(entry: AuditEntry): string {
  return copy.audit.actions[entry.action] ?? entry.action;
}

export function actorLabel(entry: AuditEntry): string {
  if (entry.actor.type === "system") return copy.audit.system;
  const name = entry.actor.name ?? copy.common.unknown;
  return entry.actor.type === "api_key" ? `${name} (${copy.audit.apiKey})` : name;
}

/** One readable line from the entry's details: who was changed, which keys, why it failed. */
export function detailsLine(entry: AuditEntry): string {
  const d = entry.details;
  const parts: string[] = [];
  if (text(d.name)) parts.push(text(d.name)!);
  if (text(d.email)) parts.push(text(d.email)!);
  if (isRole(d.from) && isRole(d.to)) parts.push(`${copy.roles[d.from]} → ${copy.roles[d.to]}`);
  else if (isRole(d.role)) parts.push(copy.roles[d.role]);
  if (Array.isArray(d.keys) && d.keys.length) parts.push(d.keys.join(", "));
  if (text(d.reason)) parts.push(text(d.reason)!.replace(/_/g, " "));
  if (text(d.detail)) parts.push(text(d.detail)!);
  for (const key of ["shortcut", "title", "url", "method", "via"] as const) {
    const value = text(d[key]);
    if (value) parts.push(key === "shortcut" ? `/${value}` : value);
  }
  if (Array.isArray(d.scopes)) parts.push(d.scopes.join(", "));
  return parts.join(" · ");
}

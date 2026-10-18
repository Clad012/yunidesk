// Who may do what in the team dashboard and API. The server enforces it; the dashboard reads the
// same table to hide or disable what a role can't do. API keys don't use roles: their scopes
// (API_SCOPES) decide, checked against the server's deny-by-default route list.

export const AGENT_ROLES = ["owner", "admin", "agent", "viewer"] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];

export const PERMISSIONS = [
  /** Reply, write internal notes, upload attachments. */
  "inbox.reply",
  /** Assign, snooze, resolve, reopen, mark as read. */
  "inbox.update",
  /** Create, edit and delete saved replies. */
  "savedReplies.manage",
  /** Download everything about a contact (GDPR access). */
  "contacts.export",
  /** Delete a contact with their conversations and files (GDPR erasure). */
  "contacts.erase",
  /** Workspace settings: messenger, install, webhooks URL and secret, retention. */
  "settings.manage",
  /** Invite people and change or disable teammates who aren't owners. */
  "team.manage",
  /** Make owners, change or disable owners, invite owners. */
  "team.manageOwners",
  "apiKeys.manage",
  "webhooks.manage",
  /** AI assistant settings, OpenRouter key, knowledge and tools. */
  "assistant.manage",
  "auditLog.read",
  /** Single sign-on configuration. */
  "sso.manage",
  /** Teams, their members, assignment rules, the fallback and per-teammate limits. */
  "teams.manage",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ADMIN: readonly Permission[] = [
  "inbox.reply",
  "inbox.update",
  "savedReplies.manage",
  "contacts.export",
  "contacts.erase",
  "settings.manage",
  "team.manage",
  "apiKeys.manage",
  "webhooks.manage",
  "assistant.manage",
  "auditLog.read",
  "teams.manage",
];

/** Everyone signed in can read the inbox, contacts, teammates and saved replies, and edit their own profile. */
export const ROLE_PERMISSIONS: Record<AgentRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: ADMIN,
  agent: ["inbox.reply", "inbox.update", "savedReplies.manage"],
  viewer: [],
};

export function isAgentRole(value: unknown): value is AgentRole {
  return typeof value === "string" && (AGENT_ROLES as readonly string[]).includes(value);
}

export function can(role: AgentRole, action: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(action) ?? false;
}

/** The roles that have `action`, e.g. to filter in SQL. */
export function rolesWith(action: Permission): AgentRole[] {
  return AGENT_ROLES.filter((role) => can(role, action));
}

export interface MemberChange {
  /** The new role; omitted when only `disabled` changes. */
  role?: AgentRole;
  disabled?: boolean;
}

export type MemberChangeRefusal =
  /** The actor can't manage the team at all. */
  | "not_allowed"
  /** Only owners make, change, disable or invite owners. */
  | "owners_only"
  /** It would leave the workspace without an active owner. */
  | "last_owner"
  /** Nobody disables their own account. */
  | "self_disable";

/**
 * Whether `actor` may apply `change` to `target`. `activeOwners` counts owners who aren't disabled,
 * the target included. Null when allowed.
 */
export function checkMemberChange(
  actor: { id: string; role: AgentRole },
  target: { id: string; role: AgentRole; disabled: boolean },
  change: MemberChange,
  activeOwners: number,
): MemberChangeRefusal | null {
  if (!can(actor.role, "team.manage")) return "not_allowed";
  const touchesOwner = target.role === "owner" || change.role === "owner";
  if (touchesOwner && !can(actor.role, "team.manageOwners")) return "owners_only";
  if (change.disabled === true && target.id === actor.id) return "self_disable";
  const losesOwner =
    target.role === "owner" && !target.disabled && ((change.role !== undefined && change.role !== "owner") || change.disabled === true);
  if (losesOwner && activeOwners <= 1) return "last_owner";
  return null;
}

/** The roles `actor` may hand out in an invite (or by changing a role). */
export function assignableRoles(actor: AgentRole): AgentRole[] {
  if (!can(actor, "team.manage")) return [];
  return AGENT_ROLES.filter((role) => role !== "owner" || can(actor, "team.manageOwners"));
}

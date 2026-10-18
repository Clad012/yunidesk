import { assignableRoles, can, checkMemberChange, rolesWith, type MemberChangeRefusal, type Permission } from "yunidesk";
import type { AppContext } from "../app-env";
import { badRequest, forbidden } from "./errors";

/**
 * Role checks for every team route. The table itself lives in `yunidesk` (packages/protocol), so the
 * dashboard hides exactly what the server refuses.
 *
 * API keys never go through roles: `authenticateApiKey` already checked the key's scope against the
 * deny-by-default route list before the route runs, and its bot teammate's role plays no part.
 * Routes that keys can't reach (not in that list) are therefore decided by the signed-in role only.
 */
export { assignableRoles, can, checkMemberChange, rolesWith };

export function requirePermission(c: AppContext, action: Permission): void {
  if (c.get("apiKey")) return;
  if (!can(c.get("agent").role, action)) throw forbidden("Your role doesn't allow this");
}

const REFUSALS: Record<MemberChangeRefusal, () => Error> = {
  not_allowed: () => forbidden("Your role doesn't allow this"),
  owners_only: () => forbidden("Only owners can change owners"),
  last_owner: () => badRequest("The team needs at least one owner", "last_owner"),
  self_disable: () => badRequest("You can't disable your own account", "self_disable"),
};

export function refusalError(refusal: MemberChangeRefusal): Error {
  return REFUSALS[refusal]();
}

/** `?, ?, ?` and the values, for `role IN (…)` built from the permission table. */
export function inList(values: readonly string[]): { sql: string; values: string[] } {
  return { sql: values.map(() => "?").join(", "), values: [...values] };
}

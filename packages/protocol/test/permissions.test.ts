import { describe, expect, it } from "vitest";
import { assignableRoles, can, checkMemberChange, rolesWith, type AgentRole } from "../src/permissions";

const person = (id: string, role: AgentRole, disabled = false) => ({ id, role, disabled });

describe("what each role can do", () => {
  it("lets owners do everything, admins everything but owners and SSO", () => {
    expect(can("owner", "sso.manage")).toBe(true);
    expect(can("owner", "team.manageOwners")).toBe(true);
    expect(can("admin", "sso.manage")).toBe(false);
    expect(can("admin", "team.manageOwners")).toBe(false);
    expect(can("admin", "team.manage")).toBe(true);
    expect(can("admin", "apiKeys.manage")).toBe(true);
    expect(can("admin", "contacts.erase")).toBe(true);
    expect(can("admin", "auditLog.read")).toBe(true);
    expect(can("admin", "teams.manage")).toBe(true);
  });

  it("keeps agents in the inbox and viewers read-only", () => {
    expect(can("agent", "inbox.reply")).toBe(true);
    expect(can("agent", "savedReplies.manage")).toBe(true);
    expect(can("agent", "settings.manage")).toBe(false);
    expect(can("agent", "contacts.export")).toBe(false);
    expect(can("agent", "auditLog.read")).toBe(false);
    expect(can("agent", "teams.manage")).toBe(false);
    expect(can("viewer", "teams.manage")).toBe(false);
    expect(can("viewer", "inbox.reply")).toBe(false);
    expect(can("viewer", "inbox.update")).toBe(false);
    expect(can("viewer", "savedReplies.manage")).toBe(false);
  });

  it("lists the roles holding a permission, for SQL filters", () => {
    expect(rolesWith("team.manage")).toEqual(["owner", "admin"]);
    expect(rolesWith("team.manageOwners")).toEqual(["owner"]);
    expect(rolesWith("teams.manage")).toEqual(["owner", "admin"]);
  });

  it("only offers owner invites to owners", () => {
    expect(assignableRoles("owner")).toEqual(["owner", "admin", "agent", "viewer"]);
    expect(assignableRoles("admin")).toEqual(["admin", "agent", "viewer"]);
    expect(assignableRoles("agent")).toEqual([]);
  });
});

describe("changing a teammate", () => {
  const owner = person("o1", "owner");
  const admin = person("a1", "admin");

  it("needs team rights at all", () => {
    expect(checkMemberChange(person("g", "agent"), person("v", "viewer"), { role: "agent" }, 1)).toBe("not_allowed");
    expect(checkMemberChange(admin, person("v", "viewer"), { role: "agent" }, 1)).toBeNull();
  });

  it("lets only owners make, change or disable owners", () => {
    expect(checkMemberChange(admin, person("g", "agent"), { role: "owner" }, 2)).toBe("owners_only");
    expect(checkMemberChange(admin, person("o2", "owner"), { role: "agent" }, 2)).toBe("owners_only");
    expect(checkMemberChange(admin, person("o2", "owner"), { disabled: true }, 2)).toBe("owners_only");
    expect(checkMemberChange(admin, admin, { role: "owner" }, 1)).toBe("owners_only");
    expect(checkMemberChange(owner, person("g", "agent"), { role: "owner" }, 1)).toBeNull();
  });

  it("always keeps one active owner", () => {
    expect(checkMemberChange(owner, owner, { role: "admin" }, 1)).toBe("last_owner");
    expect(checkMemberChange(owner, person("o2", "owner"), { disabled: true }, 1)).toBe("last_owner");
    expect(checkMemberChange(owner, owner, { role: "admin" }, 2)).toBeNull();
    expect(checkMemberChange(owner, owner, { role: "owner" }, 1)).toBeNull();
    // A disabled owner isn't counted, so re-enabling or changing one never trips the rule.
    expect(checkMemberChange(owner, person("o2", "owner", true), { role: "agent" }, 1)).toBeNull();
  });

  it("never lets someone disable themselves", () => {
    expect(checkMemberChange(owner, owner, { disabled: true }, 3)).toBe("self_disable");
    expect(checkMemberChange(admin, admin, { disabled: true }, 1)).toBe("self_disable");
    expect(checkMemberChange(admin, admin, { role: "agent" }, 1)).toBeNull();
  });
});

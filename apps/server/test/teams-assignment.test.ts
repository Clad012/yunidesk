import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { AssignmentConditions, AssignmentRule } from "yunidesk";
import { APPLY_ROUTE_SQL, CLAIM_TURN_SQL, TEAM_CANDIDATES_SQL, type CandidateRow } from "../src/db/assignment-sql";
import { isVisibleToContact } from "../src/db/conversations";
import { requiredScope } from "../src/lib/api-keys";
import {
  assignInTeam,
  chooseAssignee,
  matchesConditions,
  pickTarget,
  type Candidate,
  type ConversationFacts,
  type TurnStore,
} from "../src/lib/assignment";

const OPEN: AssignmentConditions = { channel: "any", contact: "any", tagId: null, attribute: null };
const facts = (patch: Partial<ConversationFacts> = {}): ConversationFacts => ({
  channel: "web",
  isIdentified: true,
  tagIds: [],
  attributes: {},
  ...patch,
});

describe("rule conditions", () => {
  it("matches the channel, with app meaning iOS or Android", () => {
    expect(matchesConditions({ ...OPEN, channel: "web" }, facts({ channel: "web" }))).toBe(true);
    expect(matchesConditions({ ...OPEN, channel: "web" }, facts({ channel: "ios" }))).toBe(false);
    expect(matchesConditions({ ...OPEN, channel: "app" }, facts({ channel: "ios" }))).toBe(true);
    expect(matchesConditions({ ...OPEN, channel: "app" }, facts({ channel: "android" }))).toBe(true);
    expect(matchesConditions({ ...OPEN, channel: "app" }, facts({ channel: "web" }))).toBe(false);
    expect(matchesConditions({ ...OPEN, channel: "email" }, facts({ channel: "web" }))).toBe(false);
    expect(matchesConditions({ ...OPEN, channel: "email" }, facts({ channel: "email" }))).toBe(true);
  });

  it("tells identified contacts from anonymous visitors", () => {
    expect(matchesConditions({ ...OPEN, contact: "identified" }, facts({ isIdentified: false }))).toBe(false);
    expect(matchesConditions({ ...OPEN, contact: "anonymous" }, facts({ isIdentified: true }))).toBe(false);
    expect(matchesConditions({ ...OPEN, contact: "anonymous" }, facts({ isIdentified: false }))).toBe(true);
  });

  it("needs the tag when one is set", () => {
    expect(matchesConditions({ ...OPEN, tagId: "tag_a" }, facts({ tagIds: ["tag_b"] }))).toBe(false);
    expect(matchesConditions({ ...OPEN, tagId: "tag_a" }, facts({ tagIds: ["tag_b", "tag_a"] }))).toBe(true);
  });

  it("compares a contact attribute as trimmed text, ignoring case, and never matches a missing or inherited key", () => {
    const plan = (value: string) => ({ ...OPEN, attribute: { key: "plan", value } });
    expect(matchesConditions(plan("pro"), facts({ attributes: { plan: " Pro " } }))).toBe(true);
    expect(matchesConditions(plan("pro"), facts({ attributes: { plan: "free" } }))).toBe(false);
    expect(matchesConditions({ ...OPEN, attribute: { key: "seats", value: "3" } }, facts({ attributes: { seats: 3 } }))).toBe(true);
    expect(matchesConditions({ ...OPEN, attribute: { key: "vip", value: "true" } }, facts({ attributes: { vip: true } }))).toBe(true);
    expect(matchesConditions(plan(""), facts({ attributes: {} }))).toBe(false);
    expect(matchesConditions(plan("null"), facts({ attributes: { plan: null } }))).toBe(false);
    expect(matchesConditions({ ...OPEN, attribute: { key: "__proto__", value: "[object Object]" } }, facts())).toBe(false);
    expect(matchesConditions({ ...OPEN, attribute: { key: "toString", value: String(Object.prototype.toString) } }, facts())).toBe(false);
  });

  it("needs every condition at once", () => {
    const strict: AssignmentConditions = { channel: "app", contact: "identified", tagId: "tag_a", attribute: { key: "plan", value: "pro" } };
    const all = facts({ channel: "ios", tagIds: ["tag_a"], attributes: { plan: "pro" } });
    expect(matchesConditions(strict, all)).toBe(true);
    expect(matchesConditions(strict, { ...all, isIdentified: false })).toBe(false);
    expect(matchesConditions(strict, { ...all, tagIds: [] })).toBe(false);
  });
});

describe("rule order", () => {
  const rule = (id: string, conditions: Partial<AssignmentConditions>, teamId: string): AssignmentRule => ({
    id,
    name: id,
    conditions: { ...OPEN, ...conditions },
    teamId,
    assign: "round_robin",
  });
  const rules = [rule("rul_vip", { attribute: { key: "plan", value: "pro" } }, "tem_vip"), rule("rul_app", { channel: "app" }, "tem_app"), rule("rul_all", {}, "tem_all")];
  const none = { teamId: null, assign: "none" as const };

  it("takes the first rule that matches, in order", () => {
    expect(pickTarget(rules, facts({ channel: "ios", attributes: { plan: "pro" } }), none)?.ruleId).toBe("rul_vip");
    expect(pickTarget(rules, facts({ channel: "ios" }), none)?.teamId).toBe("tem_app");
    expect(pickTarget(rules, facts({ channel: "web" }), none)?.teamId).toBe("tem_all");
  });

  it("falls back to the default team, or leaves the conversation alone", () => {
    const fallback = { teamId: "tem_default", assign: "least_busy" as const };
    expect(pickTarget(rules.slice(0, 2), facts(), fallback)).toEqual({ teamId: "tem_default", assign: "least_busy", ruleId: null });
    expect(pickTarget(rules.slice(0, 2), facts(), none)).toBeNull();
  });
});

describe("choosing a teammate", () => {
  const member = (id: string, patch: Partial<Candidate> = {}): Candidate => ({ id, availability: "available", openCount: 0, maxOpen: null, ...patch });

  it("round robin goes to whoever is next after the last pick, and wraps around", () => {
    const team = [member("agt_c"), member("agt_a"), member("agt_b")];
    expect(chooseAssignee("round_robin", team, null)).toBe("agt_a");
    expect(chooseAssignee("round_robin", team, "agt_a")).toBe("agt_b");
    expect(chooseAssignee("round_robin", team, "agt_b")).toBe("agt_c");
    expect(chooseAssignee("round_robin", team, "agt_c")).toBe("agt_a");
    // The last pick left the team: the turn goes to the next id.
    expect(chooseAssignee("round_robin", [member("agt_a"), member("agt_c")], "agt_b")).toBe("agt_c");
  });

  it("skips away teammates and those at their limit", () => {
    const team = [member("agt_a"), member("agt_b", { availability: "away" }), member("agt_c", { openCount: 2, maxOpen: 2 }), member("agt_d", { openCount: 1, maxOpen: 2 })];
    expect(chooseAssignee("round_robin", team, "agt_a")).toBe("agt_d");
    expect(chooseAssignee("round_robin", team, "agt_d")).toBe("agt_a");
    expect(chooseAssignee("least_busy", [member("agt_a", { availability: "away" }), member("agt_b", { openCount: 5 })], null)).toBe("agt_b");
    expect(chooseAssignee("round_robin", [member("agt_a", { availability: "away" }), member("agt_b", { maxOpen: 1, openCount: 1 })], null)).toBeNull();
  });

  it("least busy picks the fewest open conversations; ties go to the next in turn", () => {
    const team = [member("agt_a", { openCount: 3 }), member("agt_b", { openCount: 1 }), member("agt_c", { openCount: 1 })];
    expect(chooseAssignee("least_busy", team, null)).toBe("agt_b");
    expect(chooseAssignee("least_busy", team, "agt_b")).toBe("agt_c");
    expect(chooseAssignee("least_busy", team, "agt_c")).toBe("agt_b");
  });

  it("none leaves it to the team", () => {
    expect(chooseAssignee("none", [member("agt_a")], null)).toBeNull();
  });
});

// ---- The compare-and-set, with the real schema and SQL on SQLite ----

function database(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  const dir = new URL("../migrations/", import.meta.url);
  for (const file of readdirSync(dir).sort()) db.exec(readFileSync(new URL(file, dir), "utf8"));
  const now = Date.now();
  for (const id of ["agt_a", "agt_b", "agt_c"]) {
    db.prepare("INSERT INTO agents (id, email, name, role, password_hash, created_at) VALUES (?, ?, ?, 'agent', 'x', ?)").run(id, `${id}@example.com`, id, now);
  }
  db.prepare("INSERT INTO contacts (id, created_at) VALUES ('ctc_1', ?)").run(now);
  for (const id of ["cnv_1", "cnv_2", "cnv_3"]) {
    db.prepare("INSERT INTO conversations (id, contact_id, status, channel, created_at, updated_at, last_message_at) VALUES (?, 'ctc_1', 'open', 'web', ?, ?, ?)").run(id, now, now, now);
  }
  db.prepare("INSERT INTO teams (id, name, created_at) VALUES ('tem_1', 'Billing', ?)").run(now);
  for (const id of ["agt_a", "agt_b", "agt_c"]) db.prepare("INSERT INTO team_members (team_id, agent_id, created_at) VALUES ('tem_1', ?, ?)").run(id, now);
  return db;
}

/** The worker's D1 store, on SQLite: same statements, the batch as one transaction. */
function sqliteStore(db: DatabaseSync): TurnStore {
  return {
    async readTurn(teamId) {
      const team = db.prepare("SELECT assign_version, last_assigned_agent_id FROM teams WHERE id = ?").get(teamId) as
        | { assign_version: string; last_assigned_agent_id: string | null }
        | undefined;
      if (!team) return null;
      const rows = db.prepare(TEAM_CANDIDATES_SQL).all(teamId) as unknown as CandidateRow[];
      return {
        version: team.assign_version,
        lastAgentId: team.last_assigned_agent_id,
        members: rows.map((r) => ({ id: r.id, availability: r.availability, openCount: r.open_count, maxOpen: r.max_open })),
      };
    },
    async apply({ teamId, conversationId, assigneeId, expectedVersion, nextVersion }) {
      db.exec("BEGIN");
      db.prepare(CLAIM_TURN_SQL).run(nextVersion, assigneeId, teamId, expectedVersion, conversationId);
      const routed = db.prepare(APPLY_ROUTE_SQL).run(teamId, assigneeId, Date.now(), conversationId, teamId, nextVersion);
      db.exec("COMMIT");
      if (routed.changes) return "applied";
      const row = db.prepare("SELECT team_id, assignee_id FROM conversations WHERE id = ?").get(conversationId) as { team_id: string | null; assignee_id: string | null };
      return row.team_id !== null || row.assignee_id !== null ? "already_routed" : "lost_turn";
    },
  };
}

/** Holds every router's first read until `n` of them have read: they all see the same turn. */
function readTogether(store: TurnStore, n: number): TurnStore {
  let reads = 0;
  let release: () => void = () => undefined;
  const allRead = new Promise<void>((resolve) => (release = resolve));
  return {
    async readTurn(teamId) {
      const turn = await store.readTurn(teamId);
      if (reads < n) {
        reads += 1;
        if (reads === n) release();
        await allRead;
      }
      return turn;
    },
    apply: (input) => store.apply(input),
  };
}

let version = 0;
const nextVersion = () => `v${++version}`;
const assigneeOf = (db: DatabaseSync, id: string) =>
  (db.prepare("SELECT assignee_id FROM conversations WHERE id = ?").get(id) as { assignee_id: string | null }).assignee_id;

describe("assigning when conversations arrive at the same moment", () => {
  it("never gives two simultaneous conversations the same round-robin turn", async () => {
    const db = database();
    const store = readTogether(sqliteStore(db), 3);
    const target = { teamId: "tem_1", assign: "round_robin" as const };
    const results = await Promise.all(["cnv_1", "cnv_2", "cnv_3"].map((id) => assignInTeam(store, id, target, nextVersion)));
    expect(results.map((r) => r?.assigneeId).sort()).toEqual(["agt_a", "agt_b", "agt_c"]);
    expect(new Set(["cnv_1", "cnv_2", "cnv_3"].map((id) => assigneeOf(db, id))).size).toBe(3);
  });

  it("least busy sees the winner's new conversation before choosing again", async () => {
    const db = database();
    db.prepare("UPDATE agents SET availability = 'away' WHERE id = 'agt_c'").run();
    // Resolved conversations don't count towards anyone's load.
    for (const id of ["cnv_old1", "cnv_old2"]) {
      db.prepare("INSERT INTO conversations (id, contact_id, status, channel, assignee_id, created_at, updated_at, last_message_at) VALUES (?, 'ctc_1', 'resolved', 'web', 'agt_a', 1, 1, 1)").run(id);
    }
    const store = readTogether(sqliteStore(db), 2);
    const target = { teamId: "tem_1", assign: "least_busy" as const };
    await Promise.all(["cnv_1", "cnv_2"].map((id) => assignInTeam(store, id, target, nextVersion)));
    expect([assigneeOf(db, "cnv_1"), assigneeOf(db, "cnv_2")].sort()).toEqual(["agt_a", "agt_b"]);
  });

  it("never picks a disabled teammate", async () => {
    const db = database();
    db.prepare("UPDATE agents SET disabled_at = 1 WHERE id = 'agt_a'").run();
    const result = await assignInTeam(sqliteStore(db), "cnv_1", { teamId: "tem_1", assign: "round_robin" }, nextVersion);
    expect(result).toEqual({ assigneeId: "agt_b" });
  });

  it("leaves a conversation someone already took, stops at once and doesn't spend the turn", async () => {
    const db = database();
    db.prepare("UPDATE conversations SET assignee_id = 'agt_c' WHERE id = 'cnv_1'").run();
    const store = sqliteStore(db);
    let attempts = 0;
    const counted: TurnStore = { readTurn: (id) => store.readTurn(id), apply: (input) => (attempts++, store.apply(input)) };
    const result = await assignInTeam(counted, "cnv_1", { teamId: "tem_1", assign: "round_robin" }, nextVersion);
    expect(result).toBeNull();
    expect(attempts).toBe(1);
    expect(assigneeOf(db, "cnv_1")).toBe("agt_c");
    expect(db.prepare("SELECT team_id FROM conversations WHERE id = 'cnv_1'").get()).toEqual({ team_id: null });
    expect(db.prepare("SELECT last_assigned_agent_id FROM teams WHERE id = 'tem_1'").get()).toEqual({ last_assigned_agent_id: null });
  });
});

describe("teams stay with the team", () => {
  it("contacts never see team moves in the timeline", () => {
    expect(isVisibleToContact({ kind: "event", event: JSON.stringify({ type: "team", agentName: "Ana", teamName: "Billing" }) })).toBe(false);
  });

  it("keys read teams with conversations:read; managing teams, rules and availability is session only", () => {
    expect(requiredScope("GET", "/teams")).toBe("conversations:read");
    for (const [method, path] of [
      ["POST", "/teams"],
      ["PATCH", "/teams/tem_01j9zz0000abcdefghjkmnpqrs"],
      ["DELETE", "/teams/tem_01j9zz0000abcdefghjkmnpqrs"],
      ["PUT", "/teams/tem_01j9zz0000abcdefghjkmnpqrs/members/agt_01j9zz0000abcdefghjkmnpqrs"],
      ["DELETE", "/teams/tem_01j9zz0000abcdefghjkmnpqrs/members/agt_01j9zz0000abcdefghjkmnpqrs"],
      ["GET", "/assignment"],
      ["PUT", "/assignment"],
      ["PATCH", "/assignment/teammates/agt_01j9zz0000abcdefghjkmnpqrs"],
      ["PUT", "/me/availability"],
    ] as const) {
      expect(requiredScope(method, path), `${method} ${path}`).toBeUndefined();
    }
  });
});

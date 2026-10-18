import { describe, expect, it } from "vitest";
import type { ConversationField } from "yunidesk";
import type { ConversationRow } from "../src/db/rows";
import { toContactConversation } from "../src/db/serialize";
import { normalizeTagName } from "../src/db/tags";
import { requiredScope } from "../src/lib/api-keys";
import { isIsoDate, mergeCustomFields, validateCustomFieldsPatch } from "../src/lib/custom-fields";

const field = (key: string, type: ConversationField["type"], options: string[] = []): ConversationField => ({
  id: `fld_${key}`,
  key,
  label: key,
  type,
  options,
  position: 0,
  createdAt: 0,
});
const FIELDS = [
  field("order_id", "text"),
  field("amount", "number"),
  field("plan", "select", ["free", "pro"]),
  field("vip", "checkbox"),
  field("renewal", "date"),
];

describe("custom field values", () => {
  it("accepts each type in its own shape and clears with null or empty text", () => {
    const result = validateCustomFieldsPatch(FIELDS, {
      order_id: "  A-1042 ",
      amount: 12.5,
      plan: "pro",
      vip: false,
      renewal: "2028-02-29",
    });
    expect(result).toEqual({ ok: true, value: { order_id: "A-1042", amount: 12.5, plan: "pro", vip: false, renewal: "2028-02-29" } });
    expect(validateCustomFieldsPatch(FIELDS, { order_id: "   ", plan: null })).toEqual({ ok: true, value: { order_id: null, plan: null } });
  });

  it("refuses unknown keys, wrong types, values outside a select and over-long text", () => {
    const refused = (patch: unknown) => validateCustomFieldsPatch(FIELDS, patch).ok;
    expect(refused({ nope: "x" })).toBe(false);
    expect(refused(JSON.parse('{"__proto__":"x"}'))).toBe(false);
    expect(refused({ amount: "12" })).toBe(false);
    expect(refused({ amount: Number.POSITIVE_INFINITY })).toBe(false);
    expect(refused({ amount: 1e16 })).toBe(false);
    expect(refused({ plan: "enterprise" })).toBe(false);
    expect(refused({ plan: "Pro" })).toBe(false);
    expect(refused({ vip: "true" })).toBe(false);
    expect(refused({ renewal: "2026-02-30" })).toBe(false);
    expect(refused({ renewal: "2026-1-05" })).toBe(false);
    expect(refused({ order_id: { nested: true } })).toBe(false);
    expect(refused({ order_id: "x".repeat(1000) })).toBe(true);
    expect(refused({ order_id: "x".repeat(1001) })).toBe(false);
    expect(refused([])).toBe(false);
    expect(refused(null)).toBe(false);
  });

  it("knows real calendar days", () => {
    expect(isIsoDate("2026-10-18")).toBe(true);
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
  });

  it("merges like json_patch: null removes, the rest overwrites, untouched keys stay", () => {
    expect(mergeCustomFields({ plan: "free", vip: true, amount: 3 }, { plan: "pro", vip: null })).toEqual({ plan: "pro", amount: 3 });
  });
});

describe("tag names", () => {
  it("trims, folds spaces and drops invisible characters", () => {
    expect(normalizeTagName("  Billing \n  issue ")).toBe("Billing issue");
    expect(normalizeTagName("re‮fund")).toBe("refund");
    expect(normalizeTagName(" ​ ")).toBeNull();
    expect(normalizeTagName("x".repeat(40))).toHaveLength(40);
    expect(normalizeTagName("x".repeat(41))).toBeNull();
  });
});

describe("what a contact receives", () => {
  const row: ConversationRow = {
    id: "cnv_1",
    contact_id: "ctc_1",
    status: "snoozed",
    channel: "web",
    assignee_id: "agt_1",
    created_at: 1,
    updated_at: 2,
    last_message_at: 2,
    last_message_body: "hello",
    last_message_author: "contact",
    last_message_author_name: null,
    last_message_attachments: 0,
    last_contact_message_at: 2,
    last_agent_message_at: null,
    contact_last_read_at: 2,
    agent_last_read_at: null,
    contact_notified_at: null,
    snoozed_until: 99,
    resolved_at: null,
    rating_score: null,
    rating_comment: null,
    rating_at: null,
    ai_state: null,
    ai_lock_until: null,
    priority: "urgent",
    custom_fields: JSON.stringify({ internal_score: "churn-risk-7" }),
    team_id: "tem_vip_escalations",
  };

  it("never carries priority, tags, custom fields, the assignee, the team or the snooze", () => {
    const sent = toContactConversation(row, 0, []);
    for (const key of ["priority", "tags", "customFields", "custom_fields", "assignee", "assigneeId", "snoozedUntil", "team", "teamId", "team_id"]) {
      expect(sent).not.toHaveProperty(key);
    }
    const json = JSON.stringify(sent);
    expect(json).not.toContain("urgent");
    expect(json).not.toContain("churn-risk-7");
    expect(json).not.toContain("agt_1");
    expect(json).not.toContain("tem_vip_escalations");
    expect(sent.status).toBe("open");
  });
});

describe("tags and fields through API keys", () => {
  const cnv = "cnv_01j9zz0000abcdefghjkmnpqrs";
  const tag = "tag_01j9zz0000abcdefghjkmnpqrs";

  it("reading needs conversations:read, tagging needs conversations:write", () => {
    expect(requiredScope("GET", "/tags")).toBe("conversations:read");
    expect(requiredScope("GET", "/conversation-fields")).toBe("conversations:read");
    expect(requiredScope("POST", "/tags")).toBe("conversations:write");
    expect(requiredScope("POST", `/conversations/${cnv}/tags`)).toBe("conversations:write");
    expect(requiredScope("DELETE", `/conversations/${cnv}/tags/${tag}`)).toBe("conversations:write");
  });

  it("keeps renaming, deleting tags and defining fields to signed-in owners", () => {
    for (const [method, path] of [
      ["PATCH", `/tags/${tag}`],
      ["DELETE", `/tags/${tag}`],
      ["POST", "/conversation-fields"],
      ["POST", "/conversation-fields/reorder"],
      ["PATCH", "/conversation-fields/fld_01j9zz0000abcdefghjkmnpqrs"],
      ["DELETE", "/conversation-fields/fld_01j9zz0000abcdefghjkmnpqrs"],
      ["DELETE", `/conversations/${cnv}/tags/${tag}/x`],
    ] as const) {
      expect(requiredScope(method, path), `${method} ${path}`).toBeUndefined();
    }
  });
});

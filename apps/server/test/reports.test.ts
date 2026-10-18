import { describe, expect, it } from "vitest";
import { reportSummary, reportTags, reportTeammates, reportVolume, type ReportPeriod } from "../src/db/reports";
import { requiredScope } from "../src/lib/api-keys";
import { COUNT_REOPEN_SQL, factsEffect, factsUpdate, type MessageFacts } from "../src/lib/reports/conversation-facts";
import { csvField, toCsv } from "../src/lib/reports/csv";
import { assistantOutcome } from "../src/lib/reports/outcomes";
import { percentile } from "../src/lib/reports/percentiles";
import { localMidnight, offsetSegments, periodBounds, previousPeriod } from "../src/lib/reports/time";
import { parseReportQuery } from "../src/routes/agent/reports";
import { createTestDb, type TestDb } from "./sqlite-d1";

const MIN = 60_000;
const HOUR = 60 * MIN;
const at = (iso: string) => Date.parse(iso);

function seedPeople(db: TestDb): void {
  db.sqlite.exec(`
    INSERT INTO agents (id, email, name, role, kind, password_hash, created_at) VALUES
      ('agt_ana', 'ana@example.com', 'Ana', 'owner', 'human', 'x', 0),
      ('agt_bob', 'bob@example.com', 'Bob', 'agent', 'human', 'x', 0),
      ('agt_bot', 'bot@example.com', 'Zapier', 'agent', 'bot', 'x', 0),
      ('agt_ai', 'ai@example.com', 'Assistant', 'agent', 'bot', 'x', 0);
    INSERT INTO contacts (id, created_at) VALUES ('ctc_1', 0);`);
}

function addConversation(db: TestDb, id: string, values: Record<string, string | number | null>): void {
  const row = { contact_id: "ctc_1", status: "open", channel: "web", updated_at: 0, last_message_at: 0, ...values, id };
  const keys = Object.keys(row);
  db.sqlite
    .prepare(`INSERT INTO conversations (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})`)
    .run(...Object.values(row));
}

function addMessage(db: TestDb, conversationId: string, createdAt: number, m: { author: "contact" | "agent" | "system"; agentId?: string; kind?: string; ai?: number; event?: object }): void {
  db.sqlite
    .prepare("INSERT INTO messages (id, conversation_id, author_type, agent_id, kind, body, event, created_at, ai) VALUES (?, ?, ?, ?, ?, '', ?, ?, ?)")
    .run(`msg_${Math.random()}`, conversationId, m.author, m.agentId ?? null, m.kind ?? "text", m.event ? JSON.stringify(m.event) : null, createdAt, m.ai ?? 0);
}

function freshDb(): TestDb {
  const db = createTestDb();
  db.migrate();
  seedPeople(db);
  return db;
}

const period = (from: string, to: string, timeZone = "UTC", filter: ReportPeriod["filter"] = {}): ReportPeriod => ({ from, to, timeZone, filter });

describe("percentiles", () => {
  it("interpolates between closest ranks", () => {
    expect(percentile([4, 1, 3, 2], 50)).toBe(2.5);
    expect(percentile([1, 2, 3, 4], 90)).toBeCloseTo(3.7);
    expect(percentile([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110], 90)).toBe(100);
    expect(percentile([7], 90)).toBe(7);
    expect(percentile([], 50)).toBeNull();
  });

  it("the SQL picks the same ranks, for every group size", async () => {
    const db = freshDb();
    const start = at("2026-10-05T00:00:00Z");
    const durations: number[] = [];
    for (let n = 1; n <= 23; n++) {
      // Irregular durations, inserted out of order.
      const duration = ((n * 7919) % 101) * MIN + n;
      durations.push(duration);
      addConversation(db, `cnv_${n}`, { created_at: start + n * HOUR, first_contact_message_at: start + n * HOUR, first_human_reply_at: start + n * HOUR + duration });
      const summary = await reportSummary(db.d1, period("2026-10-05", "2026-10-06"));
      expect(summary.current.firstResponse).toEqual({ count: n, median: Math.round(percentile(durations, 50)!), p90: Math.round(percentile(durations, 90)!) });
    }
  });
});

describe("days in the viewer's time zone", () => {
  it("a day that ends daylight saving time lasts 25 hours, one that starts it 23", () => {
    const fall = periodBounds("Europe/Paris", "2026-10-25", "2026-10-25");
    expect(new Date(fall.start).toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(fall.end - fall.start).toBe(25 * HOUR);
    const spring = periodBounds("America/New_York", "2026-03-08", "2026-03-08");
    expect(new Date(spring.start).toISOString()).toBe("2026-03-08T05:00:00.000Z");
    expect(spring.end - spring.start).toBe(23 * HOUR);
    // East of UTC the offset at "midnight UTC" is already the new one: needs the second pass.
    const sydney = periodBounds("Australia/Sydney", "2026-04-05", "2026-04-05");
    expect(new Date(sydney.start).toISOString()).toBe("2026-04-04T13:00:00.000Z");
    expect(sydney.end - sydney.start).toBe(25 * HOUR);
    expect(localMidnight("Asia/Kolkata", "2026-01-01")).toBe(at("2025-12-31T18:30:00Z"));
  });

  it("cuts a period where the offset changes", () => {
    const { start, end } = periodBounds("Europe/Paris", "2026-10-20", "2026-10-30");
    expect(offsetSegments("Europe/Paris", start, end)).toEqual([
      { start, end: at("2026-10-25T01:00:00Z"), offset: 2 * HOUR },
      { start: at("2026-10-25T01:00:00Z"), end, offset: HOUR },
    ]);
    expect(offsetSegments("UTC", start, end)).toHaveLength(1);
    expect(previousPeriod("2026-03-01", "2026-03-07")).toEqual({ from: "2026-02-22", to: "2026-02-28" });
  });

  it("buckets conversations by local day and hour across the change", async () => {
    const db = freshDb();
    const created = [
      "2026-10-24T21:30:00Z", // Sat 24, 23:30 (UTC+2)
      "2026-10-24T22:30:00Z", // Sun 25, 00:30 (UTC+2)
      "2026-10-25T22:30:00Z", // Sun 25, 23:30 (UTC+1)
      "2026-10-25T23:30:00Z", // Mon 26, 00:30 (UTC+1)
    ];
    created.forEach((iso, i) => addConversation(db, `cnv_${i}`, { created_at: at(iso), status: "resolved", resolved_at: at(iso) + 10 * MIN }));
    const volume = await reportVolume(db.d1, period("2026-10-24", "2026-10-26", "Europe/Paris"));
    expect(volume.days).toEqual([
      { date: "2026-10-24", created: 1, resolved: 1 },
      { date: "2026-10-25", created: 2, resolved: 2 },
      { date: "2026-10-26", created: 1, resolved: 1 },
    ]);
    // Monday = 0 … Sunday = 6.
    expect(volume.busiestHours[5]![23]).toBe(1);
    expect(volume.busiestHours[6]![0]).toBe(1);
    expect(volume.busiestHours[6]![23]).toBe(1);
    expect(volume.busiestHours[0]![0]).toBe(1);
    expect(volume.busiestHours.flat().reduce((a, b) => a + b, 0)).toBe(4);
  });
});

describe("first response facts", () => {
  const facts = (m: Partial<MessageFacts>): MessageFacts => ({ authorType: "agent", agentKind: "human", kind: "text", ai: false, event: null, ...m });

  it("only a person's text reply counts as a human reply", () => {
    expect(factsEffect(facts({}))).toEqual({ contactMessage: false, humanReply: true, assistant: false });
    expect(factsEffect(facts({ ai: true, agentKind: "bot" }))).toEqual({ contactMessage: false, humanReply: false, assistant: true });
    expect(factsEffect(facts({ ai: true }))).toEqual({ contactMessage: false, humanReply: false, assistant: true });
    expect(factsEffect(facts({ agentKind: "bot" })).humanReply).toBe(false);
    expect(factsEffect(facts({ kind: "note" })).humanReply).toBe(false);
    expect(factsEffect(facts({ authorType: "system", agentKind: null, kind: "event", event: { type: "resolved", agentName: "Ana" } }))).toEqual({
      contactMessage: false,
      humanReply: false,
      assistant: false,
    });
    expect(factsEffect(facts({ authorType: "system", agentKind: null, kind: "event", event: { type: "handed_off", agentName: null } })).assistant).toBe(true);
    expect(factsEffect(facts({ authorType: "contact", agentKind: null }))).toEqual({ contactMessage: true, humanReply: false, assistant: false });
  });

  it("keeps the first contact message and the first human reply after it", async () => {
    const db = freshDb();
    addConversation(db, "cnv_a", { created_at: 0 });
    const apply = (m: Partial<MessageFacts>, time: number) => {
      const update = factsUpdate(factsEffect(facts(m)), "cnv_a", time);
      if (update) db.sqlite.prepare(update.sql).run(...(update.values as number[]));
    };
    const row = () => db.sqlite.prepare("SELECT first_contact_message_at, first_human_reply_at, human_replied, ai_involved FROM conversations").get();
    apply({}, 5); // outbound, before the customer wrote: no clock yet
    expect(row()).toEqual({ first_contact_message_at: null, first_human_reply_at: null, human_replied: 1, ai_involved: 0 });
    apply({ authorType: "contact", agentKind: null }, 10);
    apply({ ai: true, agentKind: "bot" }, 11);
    apply({ kind: "note" }, 12);
    apply({ agentKind: "bot" }, 13);
    apply({ authorType: "contact", agentKind: null }, 14);
    apply({}, 20);
    apply({}, 30);
    expect(row()).toEqual({ first_contact_message_at: 10, first_human_reply_at: 20, human_replied: 1, ai_involved: 1 });
  });

  it("counts a reopen only when it leaves resolved", () => {
    const db = freshDb();
    addConversation(db, "cnv_r", { created_at: 0, status: "resolved" });
    addConversation(db, "cnv_s", { created_at: 0, status: "snoozed" });
    db.sqlite.exec(`UPDATE conversations SET ${COUNT_REOPEN_SQL}, status = 'open'`);
    db.sqlite.exec(`UPDATE conversations SET ${COUNT_REOPEN_SQL}, status = 'open'`);
    expect(db.sqlite.prepare("SELECT id, reopened_count FROM conversations ORDER BY id").all()).toEqual([
      { id: "cnv_r", reopened_count: 1 },
      { id: "cnv_s", reopened_count: 0 },
    ]);
  });

  it("the migration backfills the facts from stored messages", () => {
    const db = createTestDb();
    db.migrate(6);
    seedPeople(db);
    addConversation(db, "cnv_1", { created_at: 100, status: "resolved", ai_state: "human" });
    addMessage(db, "cnv_1", 100, { author: "contact" });
    addMessage(db, "cnv_1", 110, { author: "agent", agentId: "agt_ai", ai: 1 });
    addMessage(db, "cnv_1", 120, { author: "agent", agentId: "agt_ana", kind: "note" });
    addMessage(db, "cnv_1", 130, { author: "agent", agentId: "agt_bot" });
    addMessage(db, "cnv_1", 140, { author: "agent", agentId: "agt_bob" });
    addMessage(db, "cnv_1", 150, { author: "system", agentId: "agt_bob", kind: "event", event: { type: "resolved", agentName: "Bob" } });
    addMessage(db, "cnv_1", 160, { author: "contact" });
    addMessage(db, "cnv_1", 170, { author: "system", agentId: "agt_bob", kind: "event", event: { type: "resolved", agentName: "Bob" } });
    addConversation(db, "cnv_2", { created_at: 200, status: "open", ai_state: "handed_off" });
    addMessage(db, "cnv_2", 200, { author: "contact" });
    addMessage(db, "cnv_2", 210, { author: "system", kind: "event", event: { type: "handed_off", agentName: null } });
    addMessage(db, "cnv_2", 220, { author: "agent", agentId: "agt_bot" });
    db.migrate();
    expect(
      db.sqlite.prepare("SELECT id, first_contact_message_at, first_human_reply_at, human_replied, ai_involved, reopened_count FROM conversations ORDER BY id").all(),
    ).toEqual([
      { id: "cnv_1", first_contact_message_at: 100, first_human_reply_at: 140, human_replied: 1, ai_involved: 1, reopened_count: 1 },
      { id: "cnv_2", first_contact_message_at: 200, first_human_reply_at: null, human_replied: 0, ai_involved: 1, reopened_count: 0 },
    ]);
  });
});

describe("AI assistant outcomes", () => {
  it("resolved without a person replying counts as AI resolved; a hand-off never does", () => {
    expect(assistantOutcome({ resolved: 1, human_replied: 0, ai_state: "active" })).toBe("resolved");
    expect(assistantOutcome({ resolved: 1, human_replied: 0, ai_state: "off" })).toBe("resolved");
    expect(assistantOutcome({ resolved: 1, human_replied: 1, ai_state: "human" })).toBe("other");
    expect(assistantOutcome({ resolved: 0, human_replied: 0, ai_state: "active" })).toBe("other");
    expect(assistantOutcome({ resolved: 1, human_replied: 0, ai_state: "handed_off" })).toBe("handed_off");
  });

  it("summarises a period, its previous period and the filters", async () => {
    const db = freshDb();
    const day = at("2026-10-10T09:00:00Z");
    const conversation = (id: string, v: Record<string, string | number | null>) =>
      addConversation(db, id, { created_at: day, first_contact_message_at: day, ...v });
    conversation("cnv_ai_done", { status: "resolved", resolved_at: day + 30 * MIN, ai_involved: 1, ai_state: "active", rating_score: 3, rating_at: day + HOUR });
    conversation("cnv_ai_human", { status: "resolved", resolved_at: day + 3 * HOUR, ai_involved: 1, ai_state: "human", human_replied: 1, first_human_reply_at: day + 10 * MIN, assignee_id: "agt_ana", rating_score: 1, rating_at: day + 4 * HOUR, reopened_count: 2 });
    conversation("cnv_ai_handoff", { ai_involved: 1, ai_state: "handed_off", channel: "ios" });
    conversation("cnv_people", { status: "snoozed", human_replied: 1, first_human_reply_at: day + 20 * MIN, assignee_id: "agt_bob", rating_score: 2, rating_at: day + HOUR });
    conversation("cnv_before", { created_at: at("2026-10-03T09:00:00Z") });
    db.sqlite.exec(`INSERT INTO tags (id, name, color, created_at) VALUES ('tag_1', 'billing', 'blue', 0);
      INSERT INTO conversation_tags VALUES ('cnv_ai_human', 'tag_1', 0), ('cnv_people', 'tag_1', 0);`);

    const summary = await reportSummary(db.d1, period("2026-10-07", "2026-10-13"));
    expect(summary.current).toMatchObject({
      created: 4,
      resolved: 2,
      reopened: 1,
      firstResponse: { count: 2, median: 15 * MIN, p90: 19 * MIN },
      resolution: { count: 2, median: 105 * MIN },
      satisfaction: { rated: 3, great: 1, okay: 1, bad: 1, csat: 1 / 3 },
      assistant: { involved: 3, resolved: 1, handedOff: 1, resolutionRate: 1 / 3 },
    });
    expect(summary.previous).toMatchObject({ from: "2026-09-30", to: "2026-10-06", created: 1, resolved: 0 });
    expect(summary.snapshot).toEqual({ open: 2, snoozed: 1 });

    const tagged = await reportSummary(db.d1, period("2026-10-07", "2026-10-13", "UTC", { tagId: "tag_1" }));
    expect(tagged.current.created).toBe(2);
    expect((await reportSummary(db.d1, period("2026-10-07", "2026-10-13", "UTC", { channel: "ios" }))).current.created).toBe(1);
    expect((await reportSummary(db.d1, period("2026-10-07", "2026-10-13", "UTC", { assigneeId: null }))).current.created).toBe(2);

    const teammates = await reportTeammates(db.d1, period("2026-10-07", "2026-10-13"));
    expect(teammates.map((t) => [t.agent.name, t.assigned, t.resolved, t.firstResponseMedian, t.rated, t.csat])).toEqual([
      ["Ana", 1, 1, 10 * MIN, 1, 0],
      ["Bob", 1, 0, 20 * MIN, 1, 0],
    ]);
    const tags = await reportTags(db.d1, period("2026-10-07", "2026-10-13"));
    expect(tags).toEqual([{ tag: { id: "tag_1", name: "billing", color: "blue" }, conversations: 2, resolved: 1, resolutionMedian: 3 * HOUR }]);
  });
});

describe("CSV export", () => {
  it("quotes what needs quoting and defuses spreadsheet formulas", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField('say "hi", then go')).toBe('"say ""hi"", then go"');
    expect(csvField("two\nlines")).toBe('"two\nlines"');
    expect(csvField("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvField("-1")).toBe("'-1");
    expect(csvField(-1)).toBe("-1");
    expect(csvField(null)).toBe("");
    expect(toCsv(["a", "b"], [["x,y", 2]])).toBe('a,b\r\n"x,y",2\r\n');
  });
});

describe("report access and query", () => {
  it("API keys need reports:read, and only for the four report routes", () => {
    expect(requiredScope("GET", "/reports/summary")).toBe("reports:read");
    expect(requiredScope("GET", "/reports/tags")).toBe("reports:read");
    expect(requiredScope("GET", "/reports/summaryx")).toBeUndefined();
    expect(requiredScope("POST", "/reports/summary")).toBeUndefined();
  });

  it("refuses unknown time zones and periods that are backwards or too long", () => {
    expect(parseReportQuery({ from: "2026-10-01", to: "2026-10-07", tz: "Europe/Paris" }).timeZone).toBe("Europe/Paris");
    expect(parseReportQuery({ from: "2026-10-01", to: "2026-10-07", assigneeId: "none" }).filter).toEqual({ assigneeId: null });
    expect(() => parseReportQuery({ from: "2026-10-01", to: "2026-10-07", tz: "Mars/Olympus" })).toThrow();
    expect(() => parseReportQuery({ from: "2026-10-07", to: "2026-10-01" })).toThrow();
    expect(() => parseReportQuery({ from: "2025-01-01", to: "2026-01-02" })).toThrow();
    expect(() => parseReportQuery({ from: "2026-02-30", to: "2026-03-01" })).toThrow();
  });
});

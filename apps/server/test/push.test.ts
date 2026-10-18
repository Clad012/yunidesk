import { describe, expect, it } from "vitest";
import type { ConversationRow } from "../src/db/rows";
import { DEFAULT_PUSH_PREFERENCES, parsePushPreferences, pushPayload, pushRecipients, type PushCandidate } from "../src/lib/push/notify";

const conversation = (assignee: string | null) => ({ id: "cnv_1", contact_id: "ctc_1", assignee_id: assignee }) as ConversationRow;
const person = (id: string, off: Partial<typeof DEFAULT_PUSH_PREFERENCES> = {}): PushCandidate => ({
  id,
  preferences: { ...DEFAULT_PUSH_PREFERENCES, ...off },
});
const team = [person("ana"), person("bob"), person("cy", { newConversation: false, handoff: false })];
const nobodyLooking = new Set<string>();

describe("who gets a push", () => {
  it("new unassigned conversations go to everyone who wants them, except people looking at the dashboard", () => {
    const event = { kind: "newConversation", conversation: conversation(null), preview: "Hi" } as const;
    expect(pushRecipients(event, team, nobodyLooking)).toEqual(["ana", "bob"]);
    expect(pushRecipients(event, team, new Set(["ana"]))).toEqual(["bob"]);
    expect(pushRecipients({ ...event, conversation: conversation("bob") }, team, nobodyLooking)).toEqual([]);
  });

  it("customer messages in an assigned conversation reach only the assignee", () => {
    const event = { kind: "assignedMessage", conversation: conversation("cy"), preview: "Still broken" } as const;
    expect(pushRecipients(event, team, nobodyLooking)).toEqual(["cy"]);
    expect(pushRecipients(event, [person("cy", { assignedMessage: false })], nobodyLooking)).toEqual([]);
    expect(pushRecipients({ ...event, conversation: conversation(null) }, team, nobodyLooking)).toEqual([]);
  });

  it("an assignment notifies the assignee, never the person who did it", () => {
    const event = { kind: "assigned", conversation: conversation("bob"), actor: { id: "ana", name: "Ana" } } as const;
    expect(pushRecipients(event, team, nobodyLooking)).toEqual(["bob"]);
    expect(pushRecipients({ ...event, actor: { id: "bob", name: "Bob" } }, team, nobodyLooking)).toEqual([]);
  });

  it("a handoff goes to the assignee if there is one, otherwise to everyone who wants it", () => {
    expect(pushRecipients({ kind: "handoff", conversation: conversation(null) }, team, nobodyLooking)).toEqual(["ana", "bob"]);
    expect(pushRecipients({ kind: "handoff", conversation: conversation("cy") }, team, nobodyLooking)).toEqual([]);
    expect(pushRecipients({ kind: "handoff", conversation: conversation("bob") }, team, nobodyLooking)).toEqual(["bob"]);
  });
});

describe("push preferences", () => {
  it("default to on and ignore junk", () => {
    expect(parsePushPreferences("{}")).toEqual(DEFAULT_PUSH_PREFERENCES);
    expect(parsePushPreferences("not json")).toEqual(DEFAULT_PUSH_PREFERENCES);
    expect(parsePushPreferences('{"assigned":false,"handoff":"no"}')).toEqual({ ...DEFAULT_PUSH_PREFERENCES, assigned: false });
  });
});

describe("push payload", () => {
  it("carries a one-line preview of at most 120 characters, tagged by conversation", () => {
    const payload = pushPayload({ kind: "assignedMessage", conversation: conversation("ana"), preview: `Line one\n\n${"x".repeat(300)}` }, "Jane");
    expect(payload.body.length).toBeLessThanOrEqual(120);
    expect(payload.body.startsWith("Line one x")).toBe(true);
    expect(payload).toMatchObject({ title: "Jane", tag: "cnv_1", url: "/inbox/all/cnv_1" });
    expect(pushPayload({ kind: "newConversation", conversation: conversation(null), preview: "" }, null).title).toBe("New conversation");
  });
});

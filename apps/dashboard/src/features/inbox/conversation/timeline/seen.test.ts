import { describe, expect, it } from "vitest";
import { message } from "@/test/fixtures";
import { seenMessageId } from "./seen";

const agent = { id: "a", name: "Ana", avatarUrl: null };

describe("seenMessageId", () => {
  const thread = [message("c1", 10), message("t1", 20, { authorType: "agent", agent }), message("n1", 30, { authorType: "agent", agent, kind: "note" })];

  it("marks the last team reply once the contact read past it, ignoring notes after it", () => {
    expect(seenMessageId(thread, 25)).toBe("t1");
  });
  it("shows nothing when the contact read before the reply", () => {
    expect(seenMessageId(thread, 19)).toBeNull();
  });
  it("shows nothing for a reply still sending", () => {
    expect(seenMessageId([...thread, { ...message("t2", 40, { authorType: "agent", agent }), delivery: "sending" }], 50)).toBeNull();
  });
});

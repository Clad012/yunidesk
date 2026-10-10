import { describe, expect, it } from "vitest";
import { BRIDGE_SOURCE, envelope, parseFrameMessage, parseHostMessage } from "./bridge";

const boot = {
  userToken: "a.b.c",
  tokenProvider: false,
  locale: "fr",
  hideDefaultLauncher: false,
  alignment: "left",
  mobile: true,
};

describe("bridge validation", () => {
  it("round-trips a boot through the envelope", () => {
    expect(parseHostMessage(envelope({ type: "boot", payload: { ...boot, alignment: "left" } }))).toEqual({ type: "boot", payload: boot });
  });

  it("rejects messages from anything but the bridge", () => {
    expect(parseHostMessage({ type: "open" })).toBeNull();
    expect(parseHostMessage({ source: "other", type: "open" })).toBeNull();
    expect(parseFrameMessage("yunidesk")).toBeNull();
  });

  it("rejects a boot with a wrong field type or alignment", () => {
    expect(parseHostMessage({ source: BRIDGE_SOURCE, type: "boot", payload: { ...boot, tokenProvider: "yes" } })).toBeNull();
    expect(parseHostMessage({ source: BRIDGE_SOURCE, type: "boot", payload: { ...boot, alignment: "center" } })).toBeNull();
    expect(parseHostMessage({ source: BRIDGE_SOURCE, type: "boot", payload: { ...boot, locale: "x".repeat(36) } })).toBeNull();
  });

  it("copies only known fields, so a payload cannot smuggle extra data", () => {
    const parsed = parseHostMessage({ source: BRIDGE_SOURCE, type: "update", payload: { locale: "en", evil: 1 } });
    expect(parsed).toEqual({ type: "update", payload: { locale: "en" } });
  });

  it("keeps an update without the token untouched (absent is not null)", () => {
    const parsed = parseHostMessage({ source: BRIDGE_SOURCE, type: "update", payload: { locale: "fr" } });
    expect(parsed?.type).toBe("update");
    expect(parsed?.type === "update" && "userToken" in parsed.payload).toBe(false);
    expect(parseHostMessage({ source: BRIDGE_SOURCE, type: "update", payload: { userToken: 5 } })).toBeNull();
  });

  it("accepts only whole, non-negative unread counts", () => {
    expect(parseFrameMessage({ source: BRIDGE_SOURCE, type: "unread", payload: { count: 3 } })).toEqual({ type: "unread", payload: { count: 3 } });
    expect(parseFrameMessage({ source: BRIDGE_SOURCE, type: "unread", payload: { count: -1 } })).toBeNull();
    expect(parseFrameMessage({ source: BRIDGE_SOURCE, type: "unread", payload: { count: 1.5 } })).toBeNull();
  });

  it("does not let the frame claim host-only types or the host claim frame-only types", () => {
    expect(parseFrameMessage({ source: BRIDGE_SOURCE, type: "token", payload: { requestId: "r1", token: "t" } })).toBeNull();
    expect(parseHostMessage({ source: BRIDGE_SOURCE, type: "tokenRequest", payload: { requestId: "r1" } })).toBeNull();
  });

  it("requires a non-empty, short request id on token replies", () => {
    expect(parseHostMessage({ source: BRIDGE_SOURCE, type: "token", payload: { requestId: "", token: null } })).toBeNull();
    expect(parseHostMessage({ source: BRIDGE_SOURCE, type: "token", payload: { requestId: "x".repeat(65), token: null } })).toBeNull();
    expect(parseHostMessage({ source: BRIDGE_SOURCE, type: "token", payload: { requestId: "r1", token: null } })).toEqual({
      type: "token",
      payload: { requestId: "r1", token: null },
    });
  });
});

describe("token replies", () => {
  it("keeps a provider failure distinct from a signed-out (null) token", () => {
    const failed = parseHostMessage(envelope({ type: "token", payload: { requestId: "t1abc", token: null, failed: true } }));
    expect(failed).toEqual({ type: "token", payload: { requestId: "t1abc", token: null, failed: true } });
    const visitor = parseHostMessage(envelope({ type: "token", payload: { requestId: "t1abc", token: null } }));
    expect(visitor).toEqual({ type: "token", payload: { requestId: "t1abc", token: null } });
    const malformed = { type: "token", payload: { requestId: "t1abc", token: null, failed: "yes" } } as unknown as Parameters<typeof envelope>[0];
    expect(parseHostMessage(envelope(malformed))).toBeNull();
  });
});

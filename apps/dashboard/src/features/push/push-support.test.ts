import { describe, expect, it } from "vitest";
import { pushAvailability, sameServerKey, type BrowserTraits } from "./push-support";

const desktop: BrowserTraits = {
  hasServiceWorker: true,
  hasPushManager: true,
  hasNotification: true,
  isIos: false,
  isStandalone: false,
  permission: "default",
};

describe("can this browser get push notifications", () => {
  it("tells iPhone users to add the app to the Home Screen before anything else", () => {
    // A Safari tab on iOS has no PushManager: "unsupported" would be the wrong advice.
    expect(pushAvailability({ ...desktop, isIos: true, hasPushManager: false, hasNotification: false })).toBe("install");
    expect(pushAvailability({ ...desktop, isIos: true, isStandalone: true })).toBe("ready");
  });

  it("explains blocked notifications, and only offers the button when it can work", () => {
    expect(pushAvailability({ ...desktop, permission: "denied" })).toBe("denied");
    expect(pushAvailability({ ...desktop, hasPushManager: false })).toBe("unsupported");
    expect(pushAvailability(desktop)).toBe("ready");
  });
});

describe("subscription key check", () => {
  it("spots a subscription made with an older server key", () => {
    const key = "BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8";
    const bytes = Uint8Array.from(atob(key.replace(/-/g, "+").replace(/_/g, "/") + "="), (c) => c.charCodeAt(0));
    expect(sameServerKey(bytes.buffer, key)).toBe(true);
    const other = bytes.slice();
    other[40] = other[40]! ^ 1;
    expect(sameServerKey(other.buffer, key)).toBe(false);
    expect(sameServerKey(null, key)).toBe(false);
  });
});

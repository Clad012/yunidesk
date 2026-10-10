import { describe, expect, it } from "vitest";
import { linkify } from "./linkify";

describe("linkify", () => {
  it("links http(s) and www, keeping surrounding text", () => {
    expect(linkify("see https://a.io/x and www.b.com.")).toEqual([
      { type: "text", text: "see " },
      { type: "link", text: "https://a.io/x", href: "https://a.io/x" },
      { type: "text", text: " and " },
      { type: "link", text: "www.b.com", href: "https://www.b.com" },
      { type: "text", text: "." },
    ]);
  });

  it("keeps a closing paren that belongs to the URL, drops one that wraps it", () => {
    expect(linkify("(https://en.wikipedia.org/wiki/Foo_(bar))")[1]).toEqual({
      type: "link",
      text: "https://en.wikipedia.org/wiki/Foo_(bar)",
      href: "https://en.wikipedia.org/wiki/Foo_(bar)",
    });
  });

  it("never produces a javascript: link", () => {
    expect(linkify("javascript:alert(1)").every((s) => s.type === "text")).toBe(true);
  });
});

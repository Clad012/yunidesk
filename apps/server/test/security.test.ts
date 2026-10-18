import { describe, expect, it } from "vitest";
import { isVisibleToContact } from "../src/db/conversations";
import { ftsQuery } from "../src/routes/agent/inbox";
import { hashPassword, verifyPassword } from "../src/lib/crypto";
import { signFilePath, verifyFileSignature } from "../src/lib/tokens";
import { alignExtension, isPlainText, matchesSignature, resolveContentType, sanitizeFileName } from "../src/lib/uploads";
import { isAllowedWebhookUrl } from "../src/lib/webhooks";
import { isOrigin } from "../src/lib/settings";

const SECRET = "file-link-secret-for-tests-0123456789";

describe("what a contact may see", () => {
  it("never shows notes or assignment events, only text and the resolved marker", () => {
    expect(isVisibleToContact({ kind: "text", event: null })).toBe(true);
    expect(isVisibleToContact({ kind: "note", event: null })).toBe(false);
    expect(isVisibleToContact({ kind: "event", event: JSON.stringify({ type: "resolved", agentName: "Ana" }) })).toBe(true);
    expect(isVisibleToContact({ kind: "event", event: JSON.stringify({ type: "assigned", agentName: "Ana", assigneeName: "Bob" }) })).toBe(false);
    expect(isVisibleToContact({ kind: "event", event: JSON.stringify({ type: "snoozed", agentName: "Ana", until: 1 }) })).toBe(false);
    expect(isVisibleToContact({ kind: "event", event: JSON.stringify({ type: "away", agentName: null, message: {}, backAt: null }) })).toBe(true);
  });
});

describe("signed file links", () => {
  const now = Date.UTC(2026, 9, 10, 8, 30);
  const parse = (path: string) => Object.fromEntries(new URL(path, "http://x").searchParams);

  it("accepts its own link until it expires, for that file only", async () => {
    const { exp, sig } = parse(await signFilePath(SECRET, "att_1", now));
    expect(await verifyFileSignature(SECRET, "att_1", exp, sig, now)).toBe(true);
    expect(await verifyFileSignature(SECRET, "att_2", exp, sig, now)).toBe(false);
    expect(await verifyFileSignature(SECRET, "att_1", exp, sig, Number(exp) + 1)).toBe(false);
    expect(await verifyFileSignature(SECRET, "att_1", String(Number(exp) + 3600_000), sig, now)).toBe(false);
  });
});

describe("uploads", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const html = new TextEncoder().encode("<html><script>");

  it("rejects content that does not match an inline type", () => {
    expect(matchesSignature("image/png", png)).toBe(true);
    expect(matchesSignature("image/png", html)).toBe(false);
    expect(matchesSignature("image/jpeg", png)).toBe(false);
  });

  it("falls back to the extension when the browser sends no type, and never trusts svg", () => {
    expect(resolveContentType("report.pdf", "")).toBe("application/pdf");
    expect(resolveContentType("photo.HEIC", "application/octet-stream")).toBe("image/heic");
    expect(resolveContentType("logo.svg", "image/svg+xml")).toBe("image/svg+xml"); // then refused: not allowed
  });

  it("defeats the right-to-left override trick (invoice\u202Etxt.exe shown as invoiceexe.txt)", () => {
    const name = alignExtension(sanitizeFileName("invoice\u202Etxt.exe"), "text/plain");
    expect(name).toBe("invoicetxt.exe.txt");
    expect(isPlainText(new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 0x03]))).toBe(false); // "MZ" executable header
    expect(isPlainText(new TextEncoder().encode("héllo, world\n"))).toBe(true);
    expect(alignExtension("report.pdf", "application/pdf")).toBe("report.pdf");
  });

  it("strips paths and control characters from file names", () => {
    expect(sanitizeFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFileName('C:\\x\\"evil"\u0007.txt')).toBe("evil.txt");
  });
});

describe("passwords", () => {
  it("verifies the right password only", async () => {
    const hash = await hashPassword("correct-horse-battery");
    expect(await verifyPassword("correct-horse-battery", hash)).toBe(true);
    expect(await verifyPassword("correct-horse-batterz", hash)).toBe(false);
  });
});

describe("search", () => {
  it("quotes every word so FTS syntax in user input can't break the query", () => {
    expect(ftsQuery('sync "broken" OR NEAR(')).toBe('"sync"* "broken"* "OR"* "NEAR("*');
    expect(ftsQuery("   ")).toBeNull();
  });
});

describe("outbound targets", () => {
  it("only sends webhooks to public https hosts", () => {
    expect(isAllowedWebhookUrl("https://api.example.org/hooks/support", "support.example.com")).toBe(true);
    for (const bad of [
      "http://api.example.org/hook",
      "https://support.example.com/api/v1/session",
      "https://evil.workers.dev/x",
      "https://127.0.0.1/x",
      "https://[::1]/x",
      "https://localhost/x",
      "https://user:pass@api.example.com/x",
      "https://intranet/x",
    ]) {
      expect(isAllowedWebhookUrl(bad, "support.example.com"), bad).toBe(false);
    }
  });

  it("lets only https origins (or local dev) embed the widget", () => {
    expect(isOrigin("https://example.org")).toBe(true);
    expect(isOrigin("http://localhost:3000")).toBe(true);
    expect(isOrigin("http://example.org")).toBe(false);
    expect(isOrigin("https://example.org/path")).toBe(false);
  });
});

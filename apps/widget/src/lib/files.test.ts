import { describe, expect, it } from "vitest";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_MESSAGE, getStrings } from "yunidesk";
import { checkFiles, effectiveType } from "./files";

const strings = getStrings("en");
const file = (name: string, type: string, size = 1000) => ({ name, type, size });

describe("attachment checks", () => {
  it("accepts allowed types and refuses others with the file's name", () => {
    const { accepted, errors } = checkFiles([file("a.png", "image/png"), file("b.exe", "application/x-msdownload")], 0, strings);
    expect(accepted.map((f) => f.name)).toEqual(["a.png"]);
    expect(errors).toEqual(["b.exe can't be sent"]);
  });

  it("allows exactly the size limit and refuses one byte more", () => {
    expect(checkFiles([file("max.pdf", "application/pdf", MAX_ATTACHMENT_BYTES)], 0, strings).accepted).toHaveLength(1);
    const over = checkFiles([file("big.pdf", "application/pdf", MAX_ATTACHMENT_BYTES + 1)], 0, strings);
    expect(over.accepted).toHaveLength(0);
    expect(over.errors[0]).toContain("big.pdf is larger than");
  });

  it("refuses empty files", () => {
    expect(checkFiles([file("empty.txt", "text/plain", 0)], 0, strings).accepted).toHaveLength(0);
  });

  it("counts files already in the composer against the per-message limit", () => {
    const picked = [file("1.png", "image/png"), file("2.png", "image/png"), file("3.png", "image/png")];
    const { accepted, errors } = checkFiles(picked, MAX_ATTACHMENTS_PER_MESSAGE - 2, strings);
    expect(accepted.map((f) => f.name)).toEqual(["1.png", "2.png"]);
    expect(errors).toEqual([`You can attach up to ${MAX_ATTACHMENTS_PER_MESSAGE} files`]);
  });

  it("guesses the type from the extension when the browser gives none or a generic one", () => {
    expect(effectiveType(file("notes.md", ""))).toBe("text/plain");
    expect(effectiveType(file("report.PDF", "application/octet-stream"))).toBe("application/pdf");
    expect(effectiveType(file("photo.jpg", "image/jpeg; charset=binary"))).toBe("image/jpeg");
    expect(checkFiles([file("data.xlsx", "")], 0, strings).accepted).toHaveLength(1);
  });
});

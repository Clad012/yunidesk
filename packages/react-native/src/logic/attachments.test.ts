import { describe, expect, it } from "vitest";
import { MAX_ATTACHMENTS_PER_MESSAGE, MAX_ATTACHMENT_BYTES } from "yunidesk";
import { fromDocumentAsset, fromImageAsset, toUploadSource, validatePicked, type PickedFile } from "./attachments";

const file = (name: string, type: string, size: number | null = 1000): PickedFile => ({
  uri: `file:///tmp/${name}`,
  name,
  type,
  size,
  width: null,
  height: null,
});

describe("validatePicked", () => {
  it("drops disallowed types and files over the limit, and says why", () => {
    const { accepted, problems } = validatePicked(
      [
        file("a.png", "image/png"),
        file("b.svg", "image/svg+xml"),
        file("c.pdf", "application/pdf", MAX_ATTACHMENT_BYTES + 1),
      ],
      0,
    );
    expect(accepted.map((f) => f.name)).toEqual(["a.png"]);
    expect(problems).toEqual([
      { kind: "type", name: "b.svg" },
      { kind: "tooLarge", name: "c.pdf" },
    ]);
  });

  it("accepts a file exactly at the size limit and one of unknown size", () => {
    const { accepted } = validatePicked(
      [file("a.pdf", "application/pdf", MAX_ATTACHMENT_BYTES), file("b.pdf", "application/pdf", null)],
      0,
    );
    expect(accepted).toHaveLength(2);
  });

  it("counts files already in the tray against the per-message limit", () => {
    const picked = [file("1.png", "image/png"), file("2.png", "image/png"), file("3.png", "image/png")];
    const { accepted, problems } = validatePicked(picked, MAX_ATTACHMENTS_PER_MESSAGE - 2);
    expect(accepted.map((f) => f.name)).toEqual(["1.png", "2.png"]);
    expect(problems).toEqual([{ kind: "tooMany" }]);
  });
});

describe("picker → upload source", () => {
  it("renames a HEIC photo the picker re-encoded to JPEG", () => {
    const picked = fromImageAsset({
      uri: "file:///cache/ABC.jpg",
      width: 4032,
      height: 3024,
      fileName: "IMG_0001.HEIC",
      mimeType: "image/jpeg",
      fileSize: 2048,
    });
    expect(toUploadSource(picked)).toEqual({ uri: "file:///cache/ABC.jpg", name: "IMG_0001.jpg", type: "image/jpeg" });
    expect([picked.width, picked.height, picked.size]).toEqual([4032, 3024, 2048]);
  });

  it("keeps a .jpeg name and falls back to the uri when the picker gives no name or type", () => {
    expect(
      fromImageAsset({ uri: "file:///c/x.jpeg", width: 1, height: 1, fileName: "shot.jpeg", mimeType: "image/jpeg" })
        .name,
    ).toBe("shot.jpeg");
    const unnamed = fromImageAsset({ uri: "file:///cache/photo%20one.png?x=1", width: 0, height: 0 });
    expect(toUploadSource(unnamed)).toEqual({
      uri: "file:///cache/photo%20one.png?x=1",
      name: "photo one.png",
      type: "image/png",
    });
    expect(unnamed.width).toBeNull();
  });

  it("guesses a document's type from its name when the picker says octet-stream", () => {
    const picked = fromDocumentAsset({
      uri: "file:///docs/report.PDF",
      name: "report.PDF",
      mimeType: "application/octet-stream",
      size: 10,
    });
    expect(toUploadSource(picked)).toEqual({
      uri: "file:///docs/report.PDF",
      name: "report.PDF",
      type: "application/pdf",
    });
    expect(fromDocumentAsset({ uri: "file:///d/blob", name: "blob" }).type).toBe("application/octet-stream");
  });
});

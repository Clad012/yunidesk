import { describe, expect, it } from "vitest";
import { createExpoAttachmentPicker, type ExpoDocumentPickerModule, type ExpoImagePickerModule } from "./expo-picker";

// The Expo modules are native code outside the SDK, so they are faked; the logic under test is ours.
function fakeImagePicker(granted: boolean) {
  const calls: { camera: number; library: Record<string, unknown>[] } = { camera: 0, library: [] };
  const module: ExpoImagePickerModule = {
    requestCameraPermissionsAsync: async () => ({ granted }),
    launchCameraAsync: async () => {
      calls.camera += 1;
      return { canceled: false, assets: [{ uri: "file:///p.jpg", width: 4, height: 3, fileName: "p.jpg", mimeType: "image/jpeg" }] };
    },
    launchImageLibraryAsync: async (options) => {
      calls.library.push(options);
      return { canceled: true };
    },
  };
  return { module, calls };
}

const documents: ExpoDocumentPickerModule = {
  getDocumentAsync: async () => ({ canceled: false, assets: [{ uri: "file:///a.pdf", name: "a.pdf", mimeType: "application/pdf", size: 10 }] }),
};

describe("createExpoAttachmentPicker", () => {
  it("offers only the sources whose module is installed, and nothing when none is", () => {
    expect(createExpoAttachmentPicker({ documentPicker: documents })?.sources).toEqual(["document"]);
    expect(createExpoAttachmentPicker({ imagePicker: fakeImagePicker(true).module })?.sources).toEqual(["camera", "library"]);
    expect(createExpoAttachmentPicker({})).toBeNull();
  });

  it("never opens the camera without permission", async () => {
    const { module, calls } = fakeImagePicker(false);
    const picker = createExpoAttachmentPicker({ imagePicker: module })!;
    expect(await picker.pick("camera", 5)).toEqual({ kind: "denied" });
    expect(calls.camera).toBe(0);
  });

  it("caps library selection at the room left in the message", async () => {
    const { module, calls } = fakeImagePicker(true);
    const picker = createExpoAttachmentPicker({ imagePicker: module })!;
    await picker.pick("library", 1);
    await picker.pick("library", 3);
    expect(calls.library.map((o) => [o.allowsMultipleSelection, o.selectionLimit])).toEqual([
      [false, 1],
      [true, 3],
    ]);
  });

  it("maps picked files to uploadable ones", async () => {
    const picker = createExpoAttachmentPicker({ documentPicker: documents })!;
    expect(await picker.pick("document", 2)).toMatchObject({
      kind: "picked",
      files: [{ uri: "file:///a.pdf", name: "a.pdf", type: "application/pdf", size: 10 }],
    });
  });
});

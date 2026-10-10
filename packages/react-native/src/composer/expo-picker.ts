import { fromDocumentAsset, fromImageAsset, type DocumentAssetLike, type ImageAssetLike } from "../logic/attachments";
import type { AttachmentPicker, PickResult, PickSource } from "./attachment-picker";

// The slices of expo-image-picker and expo-document-picker we call. Declared here so the SDK
// typechecks (and bundles) in apps that don't have those packages.
type Picked<T> = { canceled: true } | { canceled: false; assets: T[] };

export interface ExpoImagePickerModule {
  requestCameraPermissionsAsync(): Promise<{ granted: boolean }>;
  launchCameraAsync(options: Record<string, unknown>): Promise<Picked<ImageAssetLike>>;
  launchImageLibraryAsync(options: Record<string, unknown>): Promise<Picked<ImageAssetLike>>;
}

export interface ExpoDocumentPickerModule {
  getDocumentAsync(options: Record<string, unknown>): Promise<Picked<DocumentAssetLike>>;
}

// JPEG at 0.8 keeps photos sharp and well under the upload limit; it also turns HEIC into JPEG,
// which every client can show inline.
const IMAGE_OPTIONS = { mediaTypes: ["images"], quality: 0.8 };

export function createExpoAttachmentPicker(modules: {
  imagePicker?: ExpoImagePickerModule | null;
  documentPicker?: ExpoDocumentPickerModule | null;
}): AttachmentPicker | null {
  const { imagePicker, documentPicker } = modules;
  const sources: PickSource[] = [];
  if (imagePicker) sources.push("camera", "library");
  if (documentPicker) sources.push("document");
  if (sources.length === 0) return null;

  return {
    sources,
    async pick(source, limit): Promise<PickResult> {
      if (source === "camera" && imagePicker) {
        const permission = await imagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) return { kind: "denied" };
        const result = await imagePicker.launchCameraAsync(IMAGE_OPTIONS);
        return result.canceled ? { kind: "cancelled" } : { kind: "picked", files: result.assets.map(fromImageAsset) };
      }
      if (source === "library" && imagePicker) {
        // The system photo picker runs out of process, so no library permission is needed.
        const result = await imagePicker.launchImageLibraryAsync({
          ...IMAGE_OPTIONS,
          allowsMultipleSelection: limit > 1,
          selectionLimit: limit,
          orderedSelection: true,
        });
        return result.canceled ? { kind: "cancelled" } : { kind: "picked", files: result.assets.map(fromImageAsset) };
      }
      if (source === "document" && documentPicker) {
        const result = await documentPicker.getDocumentAsync({ multiple: limit > 1, copyToCacheDirectory: true });
        return result.canceled ? { kind: "cancelled" } : { kind: "picked", files: result.assets.map(fromDocumentAsset) };
      }
      return { kind: "cancelled" };
    },
  };
}

/**
 * Loads the Expo pickers if the app has them. Metro treats a require inside try/catch as optional,
 * so apps without these packages still build; they just get no attach button (or pass their own picker).
 */
export function loadExpoAttachmentPicker(): AttachmentPicker | null {
  let imagePicker: ExpoImagePickerModule | null = null;
  let documentPicker: ExpoDocumentPickerModule | null = null;
  try {
    imagePicker = require("expo-image-picker") as ExpoImagePickerModule;
  } catch {
    imagePicker = null;
  }
  try {
    documentPicker = require("expo-document-picker") as ExpoDocumentPickerModule;
  } catch {
    documentPicker = null;
  }
  return createExpoAttachmentPicker({ imagePicker, documentPicker });
}

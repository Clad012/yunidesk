import type { PickedFile } from "../logic/attachments";

export type PickSource = "camera" | "library" | "document";

export type PickResult = { kind: "picked"; files: PickedFile[] } | { kind: "cancelled" } | { kind: "denied" };

/**
 * Where attachments come from. The SDK ships an Expo implementation (used automatically when
 * expo-image-picker / expo-document-picker are installed); apps on other libraries pass their own.
 *
 * `pick` returns local files the SDK can upload: `{ uri, name, type }` plus size and image dimensions
 * when known. `limit` is how many more files fit in this message (1–5).
 */
export interface AttachmentPicker {
  sources: readonly PickSource[];
  pick(source: PickSource, limit: number): Promise<PickResult>;
}

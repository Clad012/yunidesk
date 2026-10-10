import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  format,
  formatBytes,
  isAllowedAttachmentType,
  type SupportStrings,
} from "yunidesk";

// Turns what the Expo pickers return into files we can validate and upload as { uri, name, type }.
// Kept free of React Native imports so it can be unit tested.

export interface PickedFile {
  uri: string;
  name: string;
  type: string;
  /** Bytes, when the picker knows it. */
  size: number | null;
  width: number | null;
  height: number | null;
}

/** The fields of expo-image-picker's ImagePickerAsset we use. */
export interface ImageAssetLike {
  uri: string;
  width: number;
  height: number;
  fileName?: string | null;
  fileSize?: number;
  mimeType?: string;
}

/** The fields of expo-document-picker's DocumentPickerAsset we use. */
export interface DocumentAssetLike {
  uri: string;
  name: string;
  size?: number;
  mimeType?: string;
}

const EXTENSION_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  json: "application/json",
  zip: "application/zip",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  mp3: "audio/mpeg",
  m4a: "audio/x-m4a",
  mp4: "video/mp4",
  mov: "video/quicktime",
};

const TYPE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

function extensionOf(name: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1]!.toLowerCase() : "";
}

function lastPathSegment(uri: string): string {
  const clean = uri.split(/[?#]/)[0] ?? "";
  return decodeURIComponent(clean.split("/").pop() ?? "");
}

export function guessMimeType(name: string): string | null {
  return EXTENSION_TYPES[extensionOf(name)] ?? null;
}

/**
 * expo-image-picker re-encodes to JPEG when `quality` < 1, but may keep the original
 * "IMG_0001.HEIC" file name. Make the name agree with the bytes we actually send.
 */
export function fromImageAsset(asset: ImageAssetLike, index = 0): PickedFile {
  const rawName = asset.fileName?.trim() || lastPathSegment(asset.uri) || `photo-${index + 1}`;
  const type = asset.mimeType || guessMimeType(lastPathSegment(asset.uri)) || guessMimeType(rawName) || "image/jpeg";
  const wanted = TYPE_EXTENSIONS[type];
  const base = rawName.replace(/\.[a-z0-9]+$/i, "");
  const name =
    wanted && extensionOf(rawName) !== wanted && !(wanted === "jpg" && extensionOf(rawName) === "jpeg")
      ? `${base}.${wanted}`
      : rawName;
  return {
    uri: asset.uri,
    name,
    type,
    size: typeof asset.fileSize === "number" ? asset.fileSize : null,
    width: asset.width > 0 ? asset.width : null,
    height: asset.height > 0 ? asset.height : null,
  };
}

export function fromDocumentAsset(asset: DocumentAssetLike): PickedFile {
  const name = asset.name.trim() || lastPathSegment(asset.uri) || "file";
  const declared = asset.mimeType && asset.mimeType !== "application/octet-stream" ? asset.mimeType : null;
  return {
    uri: asset.uri,
    name,
    type: declared ?? guessMimeType(name) ?? "application/octet-stream",
    size: typeof asset.size === "number" ? asset.size : null,
    width: null,
    height: null,
  };
}

export type AttachmentProblem =
  { kind: "tooLarge"; name: string } | { kind: "type"; name: string } | { kind: "tooMany" };

/** Keeps what fits the server's limits, in order, and says why the rest was dropped. */
export function validatePicked(
  files: PickedFile[],
  alreadyAttached: number,
): { accepted: PickedFile[]; problems: AttachmentProblem[] } {
  const accepted: PickedFile[] = [];
  const problems: AttachmentProblem[] = [];
  let tooMany = false;
  for (const file of files) {
    if (!isAllowedAttachmentType(file.type)) problems.push({ kind: "type", name: file.name });
    else if (file.size !== null && file.size > MAX_ATTACHMENT_BYTES)
      problems.push({ kind: "tooLarge", name: file.name });
    else if (alreadyAttached + accepted.length >= MAX_ATTACHMENTS_PER_MESSAGE) tooMany = true;
    else accepted.push(file);
  }
  if (tooMany) problems.push({ kind: "tooMany" });
  return { accepted, problems };
}

export function describeProblem(strings: SupportStrings, problem: AttachmentProblem): string {
  switch (problem.kind) {
    case "tooLarge":
      return format(strings.fileTooLarge, { name: problem.name, max: formatBytes(MAX_ATTACHMENT_BYTES) });
    case "type":
      return format(strings.fileTypeNotAllowed, { name: problem.name });
    case "tooMany":
      return format(strings.tooManyFiles, { n: MAX_ATTACHMENTS_PER_MESSAGE });
  }
}

/** What `SupportClient.uploadAttachment` sends for a picked file: React Native's FormData file shape. */
export function toUploadSource(file: PickedFile): { uri: string; name: string; type: string } {
  return { uri: file.uri, name: file.name, type: file.type };
}

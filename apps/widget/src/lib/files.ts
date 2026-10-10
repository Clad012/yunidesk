import {
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_ATTACHMENT_BYTES,
  format,
  formatBytes,
  isAllowedAttachmentType,
  type SupportStrings,
} from "yunidesk";

/** Extensions the server maps to an allowed type when the browser gives no (or a generic) MIME type. */
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
  log: "text/plain",
  md: "text/plain",
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

export interface FileLike {
  name: string;
  size: number;
  type: string;
}

/** The type the server will see: the declared one if allowed, else guessed from the extension. */
export function effectiveType(file: FileLike): string {
  const declared = file.type.split(";")[0]!.trim().toLowerCase();
  if (declared && declared !== "application/octet-stream" && isAllowedAttachmentType(declared)) return declared;
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[extension] ?? declared;
}

/**
 * Splits picked files into the ones we can upload and user-facing errors.
 * `alreadyAttached` counts files already in the composer.
 */
export function checkFiles<T extends FileLike>(
  files: readonly T[],
  alreadyAttached: number,
  strings: SupportStrings,
): { accepted: T[]; errors: string[] } {
  const accepted: T[] = [];
  const errors: string[] = [];
  let room = MAX_ATTACHMENTS_PER_MESSAGE - alreadyAttached;
  let overflow = false;
  for (const file of files) {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      errors.push(format(strings.fileTooLarge, { name: file.name, max: formatBytes(MAX_ATTACHMENT_BYTES) }));
    } else if (file.size === 0 || !isAllowedAttachmentType(effectiveType(file))) {
      errors.push(format(strings.fileTypeNotAllowed, { name: file.name }));
    } else if (room <= 0) {
      overflow = true;
    } else {
      accepted.push(file);
      room -= 1;
    }
  }
  if (overflow) errors.push(format(strings.tooManyFiles, { n: MAX_ATTACHMENTS_PER_MESSAGE }));
  return { accepted, errors };
}

/** Reads an image's pixel size in the browser; null when it can't be decoded. */
export function readImageSize(file: Blob): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve(image.naturalWidth && image.naturalHeight ? { width: image.naturalWidth, height: image.naturalHeight } : null);
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });
}

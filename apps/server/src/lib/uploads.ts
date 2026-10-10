import { MAX_ATTACHMENT_BYTES, formatBytes, isAllowedAttachmentType, isInlineImage } from "yunidesk";
import type { Env } from "../env";
import { badRequest } from "./errors";
import { newId } from "./ids";
import type { AttachmentRow } from "../db/rows";

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

/** Magic bytes for the types we render inline, so a renamed HTML file can't pose as an image. */
const SIGNATURES: Record<string, (b: Uint8Array) => boolean> = {
  "image/png": (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/jpeg": (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/gif": (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38,
  "image/webp": (b) =>
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  "application/pdf": (b) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46,
};

export function resolveContentType(fileName: string, declared: string): string {
  const clean = declared.split(";")[0]!.trim().toLowerCase();
  if (clean && clean !== "application/octet-stream" && isAllowedAttachmentType(clean)) return clean;
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_TYPES[extension] ?? clean;
}

export function matchesSignature(contentType: string, head: Uint8Array): boolean {
  const check = SIGNATURES[contentType];
  return check ? check(head) : true;
}

/** The usual extension for each type (the first one listed above: "txt" for text/plain, not "md"). */
const EXTENSION_FOR_TYPE: Record<string, string> = {};
for (const [extension, type] of Object.entries(EXTENSION_TYPES)) EXTENSION_FOR_TYPE[type] ??= extension;

export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  // Drop control characters, quotes and bidi overrides ("invoice\u202Etxt.exe" would read as invoiceexe.txt).
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, "").trim();
  return (cleaned || "file").slice(0, 200);
}

/** Makes the extension agree with the content type, so what you see is what you download. */
export function alignExtension(fileName: string, contentType: string): string {
  const extension = fileName.includes(".") ? fileName.split(".").pop()!.toLowerCase() : "";
  if (EXTENSION_TYPES[extension] === contentType) return fileName;
  const expected = EXTENSION_FOR_TYPE[contentType];
  return expected ? `${fileName}.${expected}`.slice(-200) : fileName;
}

const TEXT_TYPES = new Set(["text/plain", "text/csv", "application/json"]);

/** Text uploads must be UTF-8 without NUL bytes (an executable renamed to .txt fails this). */
export function isPlainText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

export async function storeUpload(
  env: Env,
  form: FormData,
  uploader: { type: "contact" | "agent"; id: string },
): Promise<AttachmentRow> {
  const file = form.get("file");
  if (!file || typeof file === "string") throw badRequest("No file in the upload");
  const rawName = sanitizeFileName(file.name || "file");
  if (file.size === 0) throw badRequest("The file is empty");
  if (file.size > MAX_ATTACHMENT_BYTES) throw badRequest(`Files are limited to ${formatBytes(MAX_ATTACHMENT_BYTES)}`, "file_too_large");

  const contentType = resolveContentType(rawName, file.type);
  if (!isAllowedAttachmentType(contentType)) throw badRequest("This file type is not supported", "file_type");
  const fileName = alignExtension(rawName, contentType);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!matchesSignature(contentType, bytes.subarray(0, 16)) || (TEXT_TYPES.has(contentType) && !isPlainText(bytes))) {
    throw badRequest("The file content does not match its type", "file_type");
  }

  const id = newId("att");
  const key = `attachments/${uploader.type}/${uploader.id}/${id}`;
  await env.FILES.put(key, bytes, { httpMetadata: { contentType } });

  const dimension = (name: string) => {
    const value = Number(form.get(name));
    return isInlineImage(contentType) && Number.isInteger(value) && value > 0 && value < 20_000 ? value : null;
  };
  const row: AttachmentRow = {
    id,
    message_id: null,
    conversation_id: null,
    uploader_type: uploader.type,
    uploader_id: uploader.id,
    r2_key: key,
    file_name: fileName,
    content_type: contentType,
    size: file.size,
    width: dimension("width"),
    height: dimension("height"),
    created_at: Date.now(),
  };
  await env.DB.prepare(
    `INSERT INTO attachments (id, message_id, conversation_id, uploader_type, uploader_id, r2_key, file_name, content_type, size, width, height, created_at)
     VALUES (?, NULL, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, uploader.type, uploader.id, key, fileName, contentType, file.size, row.width, row.height, row.created_at)
    .run();
  return row;
}

export async function deleteObjects(env: Env, keys: string[]): Promise<void> {
  for (let i = 0; i < keys.length; i += 1000) await env.FILES.delete(keys.slice(i, i + 1000));
}

export const MAX_MESSAGE_LENGTH = 5000;
export const MAX_ATTACHMENTS_PER_MESSAGE = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Images the widget and dashboard render inline. SVG is excluded on purpose (it can carry script). */
export const INLINE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"] as const;

export const ALLOWED_ATTACHMENT_TYPES = [
  ...INLINE_IMAGE_TYPES,
  "image/heic",
  "image/heif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/zip",
  "application/json",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "video/mp4",
  "video/quicktime",
] as const;

export function isInlineImage(contentType: string): boolean {
  return (INLINE_IMAGE_TYPES as readonly string[]).includes(contentType);
}

export function isAllowedAttachmentType(contentType: string): boolean {
  return (ALLOWED_ATTACHMENT_TYPES as readonly string[]).includes(contentType);
}

/** How long a typing indicator lives without a refresh. */
export const TYPING_TTL_MS = 6000;
/** Clients send `typing: true` at most this often while the user types. */
export const TYPING_THROTTLE_MS = 2500;

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Id for reconciling optimistic messages. Not a secret, so the Math.random fallback (React Native without a crypto polyfill) is fine. */
export function createClientId(): string {
  const bytes = new Uint8Array(12);
  const webCrypto = (globalThis as { crypto?: Crypto }).crypto;
  if (webCrypto?.getRandomValues) webCrypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

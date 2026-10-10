// Verify webhook calls from the support worker in your backend.
// Header: X-Yunidesk-Signature: t=<ms>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">

export type WebhookEventName =
  | "conversation.created"
  | "message.created"
  | "conversation.updated"
  | "conversation.unread_reply"
  | "conversation.rated";

export interface WebhookPayload<T = unknown> {
  event: WebhookEventName;
  createdAt: number;
  data: T;
}

const encoder = new TextEncoder();

/** True when `rawBody` was signed with `secret` less than `toleranceMs` ago. Pass the body exactly as received. */
export async function verifyWebhookSignature(
  secret: string,
  signatureHeader: string | null,
  rawBody: string,
  options: { toleranceMs?: number; now?: number } = {},
): Promise<boolean> {
  if (!signatureHeader) return false;
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
    }),
  );
  const timestamp = Number(parts.t);
  const given = parts.v1;
  if (!Number.isFinite(timestamp) || !given) return false;
  const now = options.now ?? Date.now();
  if (Math.abs(now - timestamp) > (options.toleranceMs ?? 5 * 60 * 1000)) return false;

  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`)));
  const expected = Array.from(signature, (b) => b.toString(16).padStart(2, "0")).join("");
  if (expected.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

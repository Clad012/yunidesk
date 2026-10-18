import { constantTimeEqual } from "../crypto";

// Addresses, Message-IDs and the signed reply+ address customers answer to.

const ADDRESS = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

/** Lower-cased bare address ("Ana <Ana@Example.com>" → "ana@example.com"), or null when it isn't one. */
export function normalizeAddress(value: string | null | undefined): string | null {
  if (!value) return null;
  const bracketed = /<([^<>]*)>/.exec(value);
  const address = (bracketed ? bracketed[1]! : value).trim().toLowerCase();
  return address.length <= 254 && ADDRESS.test(address) ? address : null;
}

export function domainOf(address: string): string {
  return address.slice(address.lastIndexOf("@") + 1);
}

/** A Message-ID without its angle brackets, or null when it can't be one. */
export function normalizeMessageId(value: string | null | undefined): string | null {
  if (!value) return null;
  const id = value.trim().replace(/^<+/, "").replace(/>+$/, "").trim();
  if (!id || id.length > 250 || /[\s<>]/.test(id)) return null;
  return id;
}

/** Every Message-ID in an In-Reply-To or References header, in order, without duplicates. */
export function parseMessageIdList(value: string | null | undefined, max = 50): string[] {
  if (!value) return [];
  const bracketed = [...value.matchAll(/<([^<>]+)>/g)].map((m) => m[1]!);
  const candidates = bracketed.length ? bracketed : value.split(/[\s,]+/);
  const out: string[] = [];
  for (const candidate of candidates) {
    const id = normalizeMessageId(candidate);
    if (id && !out.includes(id)) out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

// ---- reply+<token>@<inbound domain> ----
// The token is the conversation id plus an HMAC of it, so nobody can guess the address of a
// conversation they never received an email from. Base32 lower-case: some mail servers lower-case
// local parts, and the whole address stays under the 64-character local-part limit.

const REPLY_PREFIX = "reply+";
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const SIGNATURE_LENGTH = 26;
const ID_BODY = /^[0-9a-z]{26}$/;

function base32(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += ALPHABET[(buffer << (5 - bits)) & 31];
  return out;
}

async function signature(secret: string, conversationId: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`email-reply:${conversationId}`));
  return base32(new Uint8Array(mac).subarray(0, 16)).slice(0, SIGNATURE_LENGTH);
}

export async function replyAddress(secret: string, conversationId: string, domain: string): Promise<string> {
  return `${REPLY_PREFIX}${conversationId.slice(4)}.${await signature(secret, conversationId)}@${domain}`;
}

/** The conversation a reply+ address points to, or null when it isn't one of ours or was tampered with. */
export async function conversationFromReplyAddress(secret: string, address: string, domain: string): Promise<string | null> {
  const match = /^reply\+([0-9a-z]+)\.([0-9a-z]+)@(.+)$/.exec(address.trim().toLowerCase());
  if (!match || match[3] !== domain.toLowerCase() || !ID_BODY.test(match[1]!)) return null;
  const conversationId = `cnv_${match[1]}`;
  return constantTimeEqual(await signature(secret, conversationId), match[2]!) ? conversationId : null;
}

export function isReplyAddress(address: string): boolean {
  return address.toLowerCase().startsWith(REPLY_PREFIX);
}

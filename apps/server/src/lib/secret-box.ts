import { fromBase64Url, toBase64Url } from "./crypto";

/**
 * Encrypts secrets we must read back later (webhook signing secrets), unlike passwords and API
 * keys, which are only hashed. AES-256-GCM with a key derived from SESSION_SECRET through HKDF,
 * one key per purpose. The row id is bound as associated data, so a ciphertext copied onto
 * another row does not decrypt. Format: `v1.<iv>.<ciphertext>`.
 */
const encoder = new TextEncoder();
const VERSION = "v1";

async function deriveKey(masterSecret: string, purpose: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", encoder.encode(masterSecret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: encoder.encode("yunidesk/secret-box"), info: encoder.encode(purpose) },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export async function sealSecret(masterSecret: string, purpose: string, boundTo: string, plaintext: string): Promise<string> {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const key = await deriveKey(masterSecret, purpose);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(boundTo) },
    key,
    encoder.encode(plaintext),
  );
  return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(ciphertext))}`;
}

/** Throws when the value was tampered with, belongs to another row or was sealed with another secret. */
export async function openSecret(masterSecret: string, purpose: string, boundTo: string, sealed: string): Promise<string> {
  const [version, iv, ciphertext] = sealed.split(".");
  if (version !== VERSION || !iv || !ciphertext) throw new Error("Unknown sealed secret format");
  const key = await deriveKey(masterSecret, purpose);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64Url(iv), additionalData: encoder.encode(boundTo) },
    key,
    fromBase64Url(ciphertext),
  );
  return new TextDecoder().decode(plaintext);
}

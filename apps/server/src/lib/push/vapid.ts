import type { Env } from "../../env";
import { fromBase64Url, toBase64Url } from "../crypto";
import { openSecret, sealSecret } from "../secret-box";
import { importPrivateKey, type VapidKeys } from "../web-push";

/**
 * Zero-config VAPID: the first time push is needed the server makes its own P-256 key pair.
 * The public key is the browsers' `applicationServerKey`; the private key is kept sealed with
 * SESSION_SECRET (secret-box), bound to its public key, in the `settings` table.
 */
const SETTINGS_KEY = "push.vapid";
const PURPOSE = "vapid-private-key";

interface StoredVapid {
  publicKey: string;
  /** The private scalar `d`, sealed. */
  privateKey: string;
}

let cache: { secret: string; keys: VapidKeys } | null = null;

async function readStored(env: Env): Promise<StoredVapid | null> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(SETTINGS_KEY).first<{ value: string }>();
  return row ? (JSON.parse(row.value) as StoredVapid) : null;
}

async function open(env: Env, stored: StoredVapid): Promise<VapidKeys> {
  const d = await openSecret(env.SESSION_SECRET, PURPOSE, stored.publicKey, stored.privateKey);
  return { publicKey: stored.publicKey, privateKey: await importPrivateKey(d, fromBase64Url(stored.publicKey), "ECDSA") };
}

async function generate(env: Env): Promise<StoredVapid> {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const publicKey = toBase64Url(new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer));
  const { d } = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  if (!d) throw new Error("Could not export the VAPID key");
  return { publicKey, privateKey: await sealSecret(env.SESSION_SECRET, PURPOSE, publicKey, d) };
}

export async function getVapidKeys(env: Env): Promise<VapidKeys> {
  if (cache && cache.secret === env.SESSION_SECRET) return cache.keys;
  const stored = await readStored(env);
  if (stored) {
    try {
      const keys = await open(env, stored);
      cache = { secret: env.SESSION_SECRET, keys };
      return keys;
    } catch {
      // SESSION_SECRET was changed: the old key is unreadable, and every browser subscribed with it.
      // Start over; dashboards notice the new key and subscribe again.
      console.warn("push: VAPID key unreadable (SESSION_SECRET changed?), generating a new one");
      await env.DB.batch([
        env.DB.prepare("DELETE FROM settings WHERE key = ? AND value = ?").bind(SETTINGS_KEY, JSON.stringify(stored)),
        env.DB.prepare("DELETE FROM push_subscriptions"),
      ]);
    }
  }
  const fresh = await generate(env);
  // Two requests may race here: the first insert wins and both use its key.
  await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO NOTHING")
    .bind(SETTINGS_KEY, JSON.stringify(fresh), Date.now())
    .run();
  const keys = await open(env, (await readStored(env)) ?? fresh);
  cache = { secret: env.SESSION_SECRET, keys };
  return keys;
}

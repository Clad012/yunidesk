const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/**
 * Prefixed ids that sort by creation time: 10 chars of millisecond timestamp, then 16 random chars.
 * `msg_01j9...` reads well in logs and the time prefix keeps index inserts local.
 */
export function newId(prefix: "agt" | "ctc" | "cnv" | "msg" | "att" | "inv" | "cnd" | "key" | "evt" | "whe" | "whd" | "kno" | "tol"): string {
  let time = Date.now();
  let head = "";
  for (let i = 0; i < 10; i++) {
    head = ALPHABET[time % 32] + head;
    time = Math.floor(time / 32);
  }
  const random = new Uint8Array(16);
  crypto.getRandomValues(random);
  let tail = "";
  for (const byte of random) tail += ALPHABET[byte % 32];
  return `${prefix}_${head}${tail}`;
}

/** Exponential backoff with full jitter: random in [base, min(cap, base * 2^attempt)]. */
export function backoffDelay(attempt: number, random: () => number = Math.random, base = 500, cap = 30_000): number {
  const ceiling = Math.min(cap, base * 2 ** attempt);
  return Math.round(base + random() * (ceiling - base));
}

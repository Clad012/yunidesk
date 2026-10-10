/** Loose check before we ask the server, which validates for real: something@domain.tld, no spaces. */
export function isValidEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

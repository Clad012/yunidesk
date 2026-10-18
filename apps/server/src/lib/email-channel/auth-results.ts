import type { EmailAuthResult, EmailAuthentication } from "yunidesk";

// An email's From header is not proof of anything. The receiving server (Cloudflare Email Routing)
// checks SPF, DKIM and DMARC and writes what it found in Authentication-Results (RFC 8601) and
// ARC-Authentication-Results. Only the server we trust (its authserv-id) counts: anyone can put an
// Authentication-Results header in the email they send, so we read the topmost one from our
// server, which it prepended last.

export const DEFAULT_AUTHSERV_ID = "mx.cloudflare.net";

export interface MailHeader {
  /** Lower-case header name. */
  key: string;
  value: string;
}

export interface AuthMethodResult {
  method: string;
  result: string;
  props: Record<string, string>;
}

export interface ParsedAuthResults {
  authservId: string;
  results: AuthMethodResult[];
}

const RESULTS = new Set<EmailAuthResult>(["pass", "fail", "softfail", "neutral", "none", "temperror", "permerror", "policy"]);

/** Removes (comments), which may nest, outside quoted strings. */
function stripComments(value: string): string {
  let out = "";
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < value.length; i++) {
    const ch = value[i]!;
    if (ch === "\\" && i + 1 < value.length) {
      if (depth === 0) out += ch + value[i + 1];
      i++;
    } else if (quoted) {
      out += ch;
      if (ch === '"') quoted = false;
    } else if (ch === "(") depth++;
    else if (ch === ")" && depth > 0) depth--;
    else if (depth === 0) {
      if (ch === '"') quoted = true;
      out += ch;
    }
  }
  return out;
}

function splitOutsideQuotes(value: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quoted = false;
  for (const ch of value) {
    if (ch === '"') quoted = !quoted;
    if (ch === separator && !quoted) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

const unquote = (value: string) => value.replace(/^"(.*)"$/, "$1");

/**
 * `mx.example.net; dkim=pass header.d=example.com; spf=pass smtp.mailfrom=example.com; dmarc=pass header.from=example.com`
 * ARC-Authentication-Results starts with `i=<n>;` before the authserv-id.
 */
export function parseAuthenticationResults(value: string, arc = false): ParsedAuthResults | null {
  const segments = splitOutsideQuotes(stripComments(value.replace(/\r?\n[ \t]+/g, " ")), ";");
  if (arc) {
    if (!/^i\s*=\s*\d+$/i.test(segments[0] ?? "")) return null;
    segments.shift();
  }
  const head = segments.shift();
  if (!head) return null;
  const authservId = head.split(/\s+/)[0]!.toLowerCase();
  const results: AuthMethodResult[] = [];
  for (const segment of segments) {
    const tokens = segment.split(/\s+/).filter(Boolean);
    const first = /^([a-z0-9_-]+)(?:\/\d+)?\s*=\s*([a-z]+)$/i.exec(tokens[0] ?? "");
    if (!first) continue;
    const props: Record<string, string> = {};
    for (const token of tokens.slice(1)) {
      const prop = /^([a-z0-9_.-]+)\s*=\s*(.+)$/i.exec(token);
      if (prop) props[prop[1]!.toLowerCase()] = unquote(prop[2]!).toLowerCase();
    }
    results.push({ method: first[1]!.toLowerCase(), result: first[2]!.toLowerCase(), props });
  }
  return { authservId, results };
}

/** The topmost Authentication-Results (or ARC-Authentication-Results) written by the trusted server. */
export function trustedAuthResults(headers: readonly MailHeader[], trustedAuthservId: string): ParsedAuthResults | null {
  const trusted = trustedAuthservId.toLowerCase();
  for (const header of headers) {
    const arc = header.key === "arc-authentication-results";
    if (!arc && header.key !== "authentication-results") continue;
    const parsed = parseAuthenticationResults(header.value, arc);
    if (parsed && parsed.authservId === trusted) return parsed;
  }
  return null;
}

/** Same domain, or one is a subdomain of the other (relaxed alignment, close enough without a public suffix list). */
export function isAligned(signingDomain: string, fromDomain: string): boolean {
  const d = signingDomain.toLowerCase().replace(/\.$/, "");
  const f = fromDomain.toLowerCase().replace(/\.$/, "");
  if (!d || !f || !d.includes(".")) return false;
  return d === f || f.endsWith(`.${d}`) || d.endsWith(`.${f}`);
}

const asResult = (value: string | undefined): EmailAuthResult | null =>
  value && RESULTS.has(value as EmailAuthResult) ? (value as EmailAuthResult) : null;

/** Verified = DMARC passed for the From domain, or a DKIM signature of the From domain passed. SPF alone is not enough. */
export function readAuthentication(
  headers: readonly MailHeader[],
  fromDomain: string,
  trustedAuthservId = DEFAULT_AUTHSERV_ID,
): EmailAuthentication {
  const parsed = trustedAuthResults(headers, trustedAuthservId);
  if (!parsed) return { spf: null, dkim: null, dmarc: null, verified: false };
  const of = (method: string) => parsed.results.filter((r) => r.method === method);

  const dmarc = of("dmarc")[0];
  const dmarcFrom = dmarc?.props["header.from"];
  const dmarcPass = dmarc?.result === "pass" && (!dmarcFrom || dmarcFrom === fromDomain.toLowerCase());

  const dkims = of("dkim");
  const signer = (r: AuthMethodResult) => r.props["header.d"] ?? r.props["header.i"]?.split("@").pop() ?? "";
  const alignedPass = dkims.find((r) => r.result === "pass" && isAligned(signer(r), fromDomain));

  return {
    spf: asResult(of("spf")[0]?.result),
    dkim: alignedPass ? "pass" : asResult(dkims[0]?.result),
    dmarc: asResult(dmarc?.result),
    verified: Boolean(dmarcPass || alignedPass),
  };
}

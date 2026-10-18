import type { ContactChannel } from "./durable/contact-channel";
import type { InboxHub } from "./durable/inbox-hub";

export type Env = Omit<CloudflareBindings, "CONTACT_CHANNEL" | "INBOX_HUB" | "SETUP_TOKEN" | "DEV_ORIGINS" | "PUBLIC_URL"> & {
  CONTACT_CHANNEL: DurableObjectNamespace<ContactChannel>;
  INBOX_HUB: DurableObjectNamespace<InboxHub>;
  SETUP_TOKEN?: string;
  DEV_ORIGINS?: string;
  PUBLIC_URL?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  /** Comma-separated extra `aud` values accepted on identity tokens (migrations). */
  IDENTITY_AUDIENCES?: string;
  /** Comma-separated earlier token issuer names still accepted (migrations). */
  LEGACY_TOKEN_ISSUERS?: string;
  /** Also send the webhook signature under this header name (migrations). */
  WEBHOOK_LEGACY_SIGNATURE_HEADER?: string;
  // ---- Email channel ----
  /** Where customers email you (support@example.com); Email Routing sends it (and reply+…@ the same domain) to this worker. */
  EMAIL_INBOUND_ADDRESS?: string;
  /** Cloudflare Email Service binding (`send_email` in wrangler.jsonc) used to send replies. */
  SEND_EMAIL?: SendEmail;
  /** authserv-id of the Authentication-Results we trust (default mx.cloudflare.net). */
  EMAIL_AUTHSERV_ID?: string;
  /** "development" in .dev.vars only. */
  ENVIRONMENT?: string;
};

/** Splits a comma-separated env value into trimmed, non-empty items. */
export function envList(value: string | undefined): string[] {
  return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

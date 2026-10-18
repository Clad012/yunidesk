import type { EmailProvider } from "yunidesk";
import type { OutboundEmail } from "./compose";

// The two ways out: the Cloudflare Email Service binding (`send_email`) and Resend's HTTP API.
// Only this file talks to the network; everything it sends is built by compose.ts.

export class EmailSendError extends Error {
  constructor(
    message: string,
    /** True when retrying can't help (bad sender, unknown domain, refused recipient). */
    readonly permanent: boolean,
  ) {
    super(message);
  }
}

export interface EmailTransport {
  provider: EmailProvider;
  /** Resolves with the Message-ID the provider used, when it tells us. Throws EmailSendError. */
  send(email: OutboundEmail): Promise<{ messageId: string | null }>;
}

/** Binding errors worth retrying; everything else is a configuration or address problem. */
const CLOUDFLARE_TRANSIENT = new Set([
  "E_RATE_LIMIT_EXCEEDED",
  "E_DAILY_LIMIT_EXCEEDED",
  "E_DELIVERY_FAILED",
  "E_INTERNAL_SERVER_ERROR",
]);

const short = (value: string) => value.replace(/\s+/g, " ").trim().slice(0, 300);

export function cloudflareTransport(binding: SendEmail): EmailTransport {
  return {
    provider: "cloudflare",
    async send(email) {
      try {
        // Message-ID is set by the service (it can't be overridden); we keep the one it returns.
        const result = await binding.send({
          from: { email: email.from.email, name: email.from.name },
          to: email.to,
          replyTo: email.replyTo,
          subject: email.subject,
          text: email.text,
          html: email.html,
          headers: email.headers,
        });
        return { messageId: result.messageId || null };
      } catch (error) {
        const code = (error as { code?: unknown }).code;
        const message = error instanceof Error ? error.message : String(error);
        const label = typeof code === "string" ? `${code}: ${message}` : message;
        throw new EmailSendError(short(label), typeof code === "string" ? !CLOUDFLARE_TRANSIENT.has(code) : false);
      }
    },
  };
}

export type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

export function resendTransport(apiKey: string, fetcher: Fetcher = (input, init) => fetch(input, init)): EmailTransport {
  return {
    provider: "resend",
    async send(email) {
      let response: Response;
      try {
        response = await fetcher("https://api.resend.com/emails", {
          method: "POST",
          headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
          body: JSON.stringify({
            from: `"${email.from.name}" <${email.from.email}>`,
            to: [email.to],
            reply_to: email.replyTo,
            subject: email.subject,
            text: email.text,
            html: email.html,
            headers: { ...email.headers, "Message-ID": `<${email.messageId}>` },
          }),
        });
      } catch (error) {
        throw new EmailSendError(short(`Network error: ${error instanceof Error ? error.message : String(error)}`), false);
      }
      if (!response.ok) {
        let detail = "";
        try {
          detail = ((await response.json()) as { message?: string }).message ?? "";
        } catch {
          // not JSON
        }
        const transient = response.status === 429 || response.status >= 500;
        throw new EmailSendError(short(`Resend ${response.status}${detail ? `: ${detail}` : ""}`), !transient);
      }
      return { messageId: email.messageId };
    },
  };
}

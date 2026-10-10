import type { Env } from "../env";
import { getSettings } from "./settings";
import { issueEmailVerifyToken } from "./tokens";

export function emailConfigured(env: Env): boolean {
  return Boolean(env.RESEND_API_KEY && env.EMAIL_FROM);
}

/** Sends through Resend. Content is ours only: nothing a visitor typed (not even their name) goes into an email. */
export async function sendEmail(env: Env, to: string, subject: string, text: string): Promise<void> {
  if (!emailConfigured(env)) return;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, text }),
  });
  if (!response.ok) console.warn("email send failed", response.status);
}

export async function sendEmailConfirmation(env: Env, origin: string, contactId: string, email: string): Promise<void> {
  const settings = await getSettings(env);
  const token = await issueEmailVerifyToken(env.SESSION_SECRET, contactId, email);
  const link = `${origin}/api/v1/verify-email?token=${encodeURIComponent(token)}`;
  await sendEmail(
    env,
    email,
    `Confirm your email for ${settings.teamName}`,
    [
      `Someone (hopefully you) asked ${settings.teamName} support to email this address when they reply.`,
      "",
      `Confirm: ${link}`,
      "",
      "If this wasn't you, ignore this email; nothing more will be sent.",
    ].join("\n"),
  );
}

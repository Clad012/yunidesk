import { Hono } from "hono";
import { z } from "zod";
import { limit, readBody, type AppEnv } from "../../app-env";
import { audit } from "../../lib/audit";
import { requirePermission } from "../../lib/permissions";
import { badRequest } from "../../lib/errors";
import { normalizeAddress } from "../../lib/email-channel/addresses";
import { sendTestEmail } from "../../lib/email-channel/outbound";
import { getEmailChannel, saveEmailChannel, toEmailChannelSettings, type StoredEmailChannel } from "../../lib/email-channel/settings";

const address = z
  .string()
  .trim()
  .max(254)
  .refine((value) => normalizeAddress(value) !== null, "Use an address like support@example.com")
  .transform((value) => normalizeAddress(value)!);

const patchSchema = z.object({
  enabled: z.boolean().optional(),
  inboundAddress: address.nullable().optional(),
  fromName: z.string().trim().max(60).nullable().optional(),
  fromAddress: address.nullable().optional(),
  provider: z.enum(["auto", "cloudflare", "resend"]).optional(),
});

/** Settings → Email. Session only (API keys can't reach it): reading for the team, changes for owners. */
export const emailRoutes = new Hono<AppEnv>();

emailRoutes.get("/", async (c) => c.json(await toEmailChannelSettings(c.env, await getEmailChannel(c.env))));

emailRoutes.patch("/", async (c) => {
  requirePermission(c, "settings.manage");
  const input = await readBody(c, patchSchema);
  if (input.inboundAddress !== undefined && normalizeAddress(c.env.EMAIL_INBOUND_ADDRESS)) {
    throw badRequest("The inbound address is set by EMAIL_INBOUND_ADDRESS on the server");
  }
  const patch: Partial<StoredEmailChannel> = {};
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.inboundAddress !== undefined) patch.inboundAddress = input.inboundAddress;
  if (input.fromName !== undefined) patch.fromName = input.fromName || null;
  if (input.fromAddress !== undefined) patch.fromAddress = input.fromAddress;
  if (input.provider !== undefined) patch.provider = input.provider;
  const saved = await saveEmailChannel(c.env, patch);
  if (Object.keys(patch).length) audit(c, "email_channel.updated", { type: "settings", id: "email" }, { keys: Object.keys(patch) });
  return c.json(await toEmailChannelSettings(c.env, saved));
});

/** Sends a test reply to the owner's own address, through the configured provider. */
emailRoutes.post("/test", async (c) => {
  const agent = c.get("agent");
  requirePermission(c, "settings.manage");
  await limit(c.env.WRITE_LIMITER, `email-test:${agent.id}`);
  return c.json(await sendTestEmail(c.env, agent.email));
});

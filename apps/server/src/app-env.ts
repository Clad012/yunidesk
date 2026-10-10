import type { Context } from "hono";
import type { z } from "zod";
import type { AgentRow, ContactRow } from "./db/rows";
import type { Env } from "./env";
import { badRequest, tooManyRequests } from "./lib/errors";

export type AppEnv = {
  Bindings: Env;
  Variables: { agent: AgentRow; sessionHash: string; contact: ContactRow; identified: boolean };
};

export type AppContext = Context<AppEnv>;

/** Origin used in links we hand out (file URLs, invite links). */
export function publicOrigin(c: AppContext): string {
  return (c.env.PUBLIC_URL || new URL(c.req.url).origin).replace(/\/+$/, "");
}

export function clientIp(c: AppContext): string {
  return c.req.header("cf-connecting-ip") ?? "local";
}

export async function readBody<S extends z.ZodType>(c: AppContext, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest("Expected a JSON body");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw badRequest(issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "Invalid body", "invalid_body");
  }
  return parsed.data;
}

export async function limit(limiter: RateLimit, key: string): Promise<void> {
  const { success } = await limiter.limit({ key });
  if (!success) throw tooManyRequests();
}

import type { AgentServerEvent, ContactServerEvent } from "yunidesk";
import type { Env } from "../env";

// One InboxHub for the whole team, one ContactChannel per contact.
// Both are pinned to DATA_JURISDICTION (EU by default) so live data never leaves it.

function hubNamespace(env: Env) {
  const jurisdiction = env.DATA_JURISDICTION as DurableObjectJurisdiction | "";
  return jurisdiction ? env.INBOX_HUB.jurisdiction(jurisdiction) : env.INBOX_HUB;
}

function channelNamespace(env: Env) {
  const jurisdiction = env.DATA_JURISDICTION as DurableObjectJurisdiction | "";
  return jurisdiction ? env.CONTACT_CHANNEL.jurisdiction(jurisdiction) : env.CONTACT_CHANNEL;
}

export function inboxHub(env: Env) {
  const ns = hubNamespace(env);
  return ns.get(ns.idFromName("main"));
}

export function contactChannel(env: Env, contactId: string) {
  const ns = channelNamespace(env);
  return ns.get(ns.idFromName(contactId));
}

export async function notifyAgents(env: Env, event: AgentServerEvent): Promise<void> {
  try {
    await inboxHub(env).broadcast(event);
  } catch (error) {
    console.error("realtime: agent broadcast failed", error);
  }
}

export async function notifyContact(env: Env, contactId: string, event: ContactServerEvent): Promise<void> {
  try {
    await contactChannel(env, contactId).broadcast(event);
  } catch (error) {
    console.error("realtime: contact broadcast failed", error);
  }
}

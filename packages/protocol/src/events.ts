import type { ContactServerEvent } from "./types";

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";

/**
 * Shape check for frames from the contact websocket. Anything that doesn't look like an event we
 * handle is dropped, so a bad frame can never crash the messenger while it renders.
 */
export function isContactServerEvent(value: unknown): value is ContactServerEvent {
  if (!isObject(value) || !isString(value.type)) return false;
  switch (value.type) {
    case "ready":
      return true;
    case "presence":
      return typeof value.online === "boolean";
    case "message.created":
      return (
        isObject(value.message) &&
        isString(value.message.id) &&
        isString(value.message.conversationId) &&
        isObject(value.conversation) &&
        isString(value.conversation.id)
      );
    case "conversation.updated":
      return isObject(value.conversation) && isString(value.conversation.id);
    case "conversation.read":
      return isString(value.conversationId) && typeof value.at === "number";
    case "typing":
      return (
        isString(value.conversationId) &&
        typeof value.isTyping === "boolean" &&
        isObject(value.agent) &&
        isString(value.agent.id) &&
        isString(value.agent.name)
      );
    default:
      return false;
  }
}

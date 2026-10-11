import { initialMessengerState, messengerReducer, type MessengerAction, type MessengerState } from "yunidesk";

export type FrameAction = MessengerAction | { type: "reset" };

const CONTACT_EVENTS = new Set<string>([
  "ready",
  "message.created",
  "conversation.updated",
  "conversation.read",
  "typing",
  "presence",
  "assistant.status",
  "assistant.delta",
]);

/** The shared messenger reducer, behind a list of the socket frames a contact may receive. */
export function frameReducer(state: MessengerState, action: FrameAction): MessengerState {
  if (action.type === "reset") return initialMessengerState;
  // The shared reducer returns undefined for frames it does not know (the socket's "pong", say).
  if (action.type === "event" && !CONTACT_EVENTS.has(action.event.type)) return state;
  return messengerReducer(state, action) ?? state;
}

import { envelope, parseHostMessage, type FrameMessage, type HostMessage } from "../bridge";

// Frame side of the bridge. Only the embedding page (window.parent) is trusted; its origin is
// learned from the first boot message and every later post targets that origin only.

type Listener = (message: HostMessage) => void;

const listeners = new Set<Listener>();
let parentOrigin: string | null = null;
let installed = false;

export const isEmbedded = window.parent !== window;

function onMessage(event: MessageEvent): void {
  if (!isEmbedded || event.source !== window.parent) return;
  const message = parseHostMessage(event.data);
  if (!message) return;
  if (parentOrigin === null) {
    if (message.type !== "boot") return;
    parentOrigin = event.origin;
  } else if (event.origin !== parentOrigin) {
    return;
  }
  listeners.forEach((listener) => listener(message));
}

export function onHostMessage(listener: Listener): () => void {
  if (!installed) {
    installed = true;
    window.addEventListener("message", onMessage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function postToHost(message: FrameMessage): void {
  if (!isEmbedded) return;
  // Before the first boot only "ready" goes out, and it carries nothing.
  if (parentOrigin === null) {
    if (message.type === "ready") window.parent.postMessage(envelope(message), "*");
    return;
  }
  window.parent.postMessage(envelope(message), parentOrigin);
}

const tokenRequests = new Map<
  string,
  { resolve: (token: string | null) => void; reject: (error: Error) => void; timer: number }
>();
let requestSeq = 0;

onHostMessage((message) => {
  if (message.type !== "token") return;
  const request = tokenRequests.get(message.payload.requestId);
  if (!request) return;
  tokenRequests.delete(message.payload.requestId);
  window.clearTimeout(request.timer);
  if (message.payload.failed) request.reject(new Error("The host page could not get a user token"));
  else request.resolve(message.payload.token);
});

/** Asks the host page's `getUserToken` for a fresh identity token. */
export function requestHostToken(timeoutMs = 15_000): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const requestId = `t${++requestSeq}${Date.now().toString(36)}`;
    const timer = window.setTimeout(() => {
      tokenRequests.delete(requestId);
      reject(new Error("The host page did not answer the token request"));
    }, timeoutMs);
    tokenRequests.set(requestId, { resolve, reject, timer });
    postToHost({ type: "tokenRequest", payload: { requestId } });
  });
}

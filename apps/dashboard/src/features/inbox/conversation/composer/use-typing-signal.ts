import { useCallback, useEffect, useRef } from "react";
import { TYPING_THROTTLE_MS } from "yunidesk";
import { realtime } from "@/lib/realtime/socket";

/** Sends typing frames, throttled, with a final false. Notes go out as `internal`, so only teammates see them. */
export function useTypingSignal(conversationId: string, internal: boolean) {
  const lastSent = useRef(0);
  const active = useRef(false);

  const stop = useCallback(() => {
    if (!active.current) return;
    active.current = false;
    lastSent.current = 0;
    realtime.send({ type: "typing", conversationId, isTyping: false, internal });
  }, [conversationId, internal]);

  const ping = useCallback(() => {
    const now = Date.now();
    if (active.current && now - lastSent.current < TYPING_THROTTLE_MS) return;
    active.current = true;
    lastSent.current = now;
    realtime.send({ type: "typing", conversationId, isTyping: true, internal });
  }, [conversationId, internal]);

  useEffect(() => stop, [stop]);
  return { ping, stop };
}

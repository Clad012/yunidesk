import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { applyEvent } from "@/lib/realtime/apply-event";
import { statusStore } from "@/lib/realtime/live";
import { realtime } from "@/lib/realtime/socket";

/** Opens the team socket for the signed-in teammate and folds every event into the query cache. */
export function useRealtime(meId: string): void {
  const queryClient = useQueryClient();
  useEffect(() => {
    const offEvent = realtime.emitter.on("event", (event) => applyEvent(queryClient, event, meId));
    const offStatus = realtime.emitter.on("status", (status) => statusStore.set(status));
    // Events may have been missed while offline: refetch everything that is on screen.
    const offReconnect = realtime.emitter.on("reconnected", () => void queryClient.invalidateQueries());
    realtime.start();
    return () => {
      offEvent();
      offStatus();
      offReconnect();
      realtime.stop();
    };
  }, [queryClient, meId]);
}

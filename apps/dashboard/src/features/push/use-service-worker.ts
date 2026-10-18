import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { pushEndpointStore, registerServiceWorker, syncPushDevice } from "./push-device";

const OPEN_MESSAGE = "yunidesk:open";

function isOpenMessage(data: unknown): data is { type: typeof OPEN_MESSAGE; path: string } {
  if (!data || typeof data !== "object") return false;
  const { type, path } = data as { type?: unknown; path?: unknown };
  return type === OPEN_MESSAGE && typeof path === "string" && path.startsWith("/") && !path.startsWith("//");
}

/** Registers /sw.js, keeps this device's push subscription in sync and opens clicked notifications in place. */
export function useServiceWorker(): void {
  const router = useRouter();
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return pushEndpointStore.set(null);
    registerServiceWorker()
      ?.then(() => syncPushDevice())
      .catch((error: unknown) => {
        console.warn("push: setup failed", error);
        pushEndpointStore.set((current) => current ?? null);
      });
    const onMessage = (event: MessageEvent) => {
      if (isOpenMessage(event.data)) router.history.push(event.data.path);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [router]);
}

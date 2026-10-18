// Yunidesk dashboard service worker: shows push notifications and opens the conversation on click.
// It caches nothing (no offline copies of conversations on the device) and handles no fetches.

const OPEN_MESSAGE = "yunidesk:open";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

/** Only paths on this origin, so a payload can never send the user elsewhere. */
function safePath(value) {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

function text(value, fallback) {
  return typeof value === "string" && value ? value.slice(0, 200) : fallback;
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = text(data.title, "Yunidesk");
  event.waitUntil(
    self.registration.showNotification(title, {
      body: text(data.body, ""),
      tag: text(data.tag, "yunidesk"),
      // A new message in the same conversation replaces the old notification but still alerts.
      renotify: true,
      icon: "/icons/mark-192.png",
      data: { url: safePath(data.url) },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = safePath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        // The dashboard navigates in place (no reload); see use-service-worker.ts.
        open.postMessage({ type: OPEN_MESSAGE, path });
        await open.focus();
        return;
      }
      await self.clients.openWindow(path);
    })(),
  );
});

// The browser rotated the subscription: hand the new one to the server (the cookie session signs it).
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      const options = old && old.options ? old.options : null;
      const next = event.newSubscription || (options ? await self.registration.pushManager.subscribe(options) : null);
      if (!next) return;
      const json = next.toJSON();
      await fetch("/api/agent/push/subscriptions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, replaces: old ? old.endpoint : undefined }),
      });
    })().catch(() => undefined),
  );
});

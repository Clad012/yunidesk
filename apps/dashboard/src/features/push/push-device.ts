import type { PushSubscriptionInput } from "yunidesk";
import { endpoints } from "@/lib/endpoints";
import { Store } from "@/lib/realtime/store";
import { browserTraits, fromBase64Url, pushAvailability, sameServerKey } from "./push-support";

/** This device's push subscription endpoint: null when push is off here, undefined until checked. */
export const pushEndpointStore = new Store<string | null | undefined>(undefined);

function toInput(subscription: PushSubscription, replaces?: string): PushSubscriptionInput {
  const json = subscription.toJSON();
  return {
    endpoint: subscription.endpoint,
    keys: { p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" },
    ...(replaces && replaces !== subscription.endpoint ? { replaces } : {}),
  };
}

export function registerServiceWorker(): Promise<ServiceWorkerRegistration> | null {
  if (!("serviceWorker" in navigator)) return null;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const traits = browserTraits();
  if (!traits.hasServiceWorker || !traits.hasPushManager) return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}

/**
 * Must run from a click: asks for permission (never on load), subscribes this browser with the
 * server's key and registers it. Returns the browser's answer when it isn't "granted".
 */
export async function turnOnPush(publicKey: string): Promise<NotificationPermission> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission;
  await registerServiceWorker();
  // subscribe() needs an active worker, which `ready` waits for.
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (existing && !sameServerKey(existing.options.applicationServerKey, publicKey)) await existing.unsubscribe();
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(publicKey) });
  await endpoints.pushSubscribe(toInput(subscription));
  pushEndpointStore.set(subscription.endpoint);
  return permission;
}

/** Turns push off on this device (and tells the server, while still signed in). */
export async function turnOffPush(): Promise<void> {
  const subscription = await currentSubscription();
  pushEndpointStore.set(null);
  if (!subscription) return;
  await endpoints.pushUnsubscribe(subscription.endpoint).catch(() => undefined);
  await subscription.unsubscribe().catch(() => false);
}

/**
 * On every dashboard load: re-register this device's subscription for whoever is signed in,
 * renew it if the server's key changed, and drop it if notifications were blocked meanwhile.
 */
export async function syncPushDevice(): Promise<void> {
  const subscription = await currentSubscription();
  if (!subscription) return pushEndpointStore.set(null);
  if (pushAvailability(browserTraits()) !== "ready" || Notification.permission !== "granted") {
    // Notifications were blocked since: this device can't show them any more.
    await endpoints.pushUnsubscribe(subscription.endpoint).catch(() => undefined);
    await subscription.unsubscribe().catch(() => false);
    return pushEndpointStore.set(null);
  }
  const { publicKey } = await endpoints.pushPublicKey();
  if (sameServerKey(subscription.options.applicationServerKey, publicKey)) {
    await endpoints.pushSubscribe(toInput(subscription));
    return pushEndpointStore.set(subscription.endpoint);
  }
  const registration = await navigator.serviceWorker.ready;
  await subscription.unsubscribe();
  const next = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromBase64Url(publicKey) });
  await endpoints.pushSubscribe(toInput(next, subscription.endpoint));
  pushEndpointStore.set(next.endpoint);
}

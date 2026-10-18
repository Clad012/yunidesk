import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { copy, fmt } from "@/lib/copy";
import { playChime } from "@/lib/chime";
import { realtime } from "@/lib/realtime/socket";
import { useStore } from "@/lib/realtime/store";
import { contactLabel } from "@/features/inbox/lib/labels";
import { pushEndpointStore } from "@/features/push/push-device";
import { activeConversationStore, markSeen, markUnseen, needsAttention, unseenStore } from "./attention";

/** Sound, browser notification and tab-title count for new contact messages. Mount once in the shell. */
export function useAttention(): void {
  const navigate = useNavigate();
  const unseen = useStore(unseenStore, (s) => s.size);

  useEffect(() => {
    document.title = unseen > 0 ? `(${unseen}) ${copy.appName}` : copy.appName;
  }, [unseen]);

  useEffect(() => {
    const clearActive = () => {
      const active = activeConversationStore.get();
      if (active && !document.hidden) markSeen(active);
    };
    const offActive = activeConversationStore.subscribe(clearActive);
    document.addEventListener("visibilitychange", clearActive);

    const offEvent = realtime.emitter.on("event", (event) => {
      if (event.type === "conversation.updated" && !event.conversation.unread) markSeen(event.conversation.id);
      if (event.type !== "message.created" || event.message.authorType !== "contact") return;
      const id = event.message.conversationId;
      if (!needsAttention(id, activeConversationStore.get(), document.hidden)) return;
      markUnseen(id);
      playChime();
      // With push on for this device, the service worker shows it (once, per the teammate's choices).
      if ("Notification" in window && Notification.permission === "granted" && !pushEndpointStore.get()) {
        const notification = new Notification(fmt(copy.notifications.newMessage, { name: contactLabel(event.conversation.contact) }), {
          body: event.message.body || copy.list.attachment,
          tag: id,
        });
        notification.onclick = () => {
          window.focus();
          void navigate({ to: "/inbox/$view/$conversationId", params: { view: "all", conversationId: id } });
          notification.close();
        };
      }
    });
    return () => {
      offActive();
      offEvent();
      document.removeEventListener("visibilitychange", clearActive);
    };
  }, [navigate]);
}

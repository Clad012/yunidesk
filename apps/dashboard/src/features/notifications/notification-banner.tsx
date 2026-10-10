import { BellRingIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { copy } from "@/lib/copy";
import { Button } from "@/components/ui/button";

const DISMISS_KEY = "ys-notify-dismissed";

function shouldAsk(): boolean {
  if (!("Notification" in window) || Notification.permission !== "default") return false;
  try {
    return localStorage.getItem(DISMISS_KEY) !== "1";
  } catch {
    return true;
  }
}

/** Asks for notification permission only when the agent clicks, never on load. */
export function NotificationBanner() {
  const [visible, setVisible] = useState(shouldAsk);
  if (!visible) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
    setVisible(false);
  };
  const enable = async () => {
    await Notification.requestPermission();
    setVisible(false);
  };

  return (
    <div className="mx-2 mt-2 flex items-center gap-3 rounded-xl bg-primary/10 px-4 py-2.5 text-sm">
      <BellRingIcon className="size-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1">
        <span className="font-medium">{copy.notifications.bannerTitle}</span>
        <span className="text-muted-foreground"> · {copy.notifications.bannerBody}</span>
      </p>
      <Button size="xs" onClick={() => void enable()}>
        {copy.notifications.enable}
      </Button>
      <Button size="icon-xs" variant="ghost" onClick={dismiss} aria-label={copy.notifications.dismiss}>
        <XIcon />
      </Button>
    </div>
  );
}

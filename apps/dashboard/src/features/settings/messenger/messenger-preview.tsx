import type { AdminSettings } from "yunidesk";
import { MessageCircleIcon, SendHorizontalIcon } from "lucide-react";
import { copy } from "@/lib/copy";
import { cn } from "@/lib/utils";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { PersonAvatar } from "@/components/person-avatar";

/** A static, faithful-enough picture of the widget home screen with the draft settings. */
export function MessengerPreview({ settings: s, lang }: { settings: AdminSettings; lang: "en" | "fr" }) {
  const { teammates } = useBootstrap();
  const color = /^#[0-9a-fA-F]{6}$/.test(s.brandColor) ? s.brandColor : "#6d5dfc";
  const reply = lang === "fr" ? copy.messenger[`previewReply_fr_${s.replyTime}`] : copy.messenger[`previewReply_${s.replyTime}`];
  return (
    <div className="flex flex-col gap-2 lg:sticky lg:top-4 lg:self-start">
      <p className="text-xs font-medium text-muted-foreground">{copy.messenger.preview}</p>
      <div className="overflow-hidden rounded-2xl border bg-background shadow-lg">
        <div className="px-5 pt-6 pb-10 text-white" style={{ background: `linear-gradient(160deg, ${color}, color-mix(in oklab, ${color} 70%, black))` }}>
          <div className="mb-6 flex items-center justify-between">
            <span className="text-sm font-semibold opacity-95">{s.teamName}</span>
            <span className="flex -space-x-2">
              {teammates.slice(0, 3).map((t) => (
                <PersonAvatar key={t.id} name={t.name} avatarUrl={t.avatarUrl} seed={t.id} className="size-7 text-[10px] ring-2 ring-white/40" />
              ))}
            </span>
          </div>
          <p className="text-2xl font-semibold">{s.greeting[lang] || copy.messenger.greetingPlaceholder}</p>
          <p className="mt-1 text-sm opacity-85">{s.intro[lang] || copy.messenger.introPlaceholder}</p>
        </div>
        <div className="-mt-6 px-4 pb-4">
          <div className="flex items-center gap-3 rounded-xl border bg-card p-3.5 shadow-sm">
            <div className="flex-1">
              <p className="text-sm font-medium">{lang === "fr" ? copy.messenger.previewSend_fr : copy.messenger.previewSend}</p>
              <p className="text-xs text-muted-foreground">{reply}</p>
            </div>
            <SendHorizontalIcon className="size-4" style={{ color }} />
          </div>
        </div>
      </div>
      <div className={cn("flex", s.launcherPosition === "left" ? "justify-start" : "justify-end")}>
        <span className="flex size-12 items-center justify-center rounded-full text-white shadow-lg" style={{ background: color }}>
          <MessageCircleIcon className="size-5" />
        </span>
      </div>
    </div>
  );
}

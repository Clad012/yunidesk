import { AppleIcon, GlobeIcon, MailIcon, SmartphoneIcon } from "lucide-react";
import type { Channel } from "yunidesk";
import { copy } from "@/lib/copy";

export function ChannelIcon({ channel, className }: { channel: Channel; className?: string }) {
  const label = copy.list[`channel_${channel}`];
  const Icon = channel === "web" ? GlobeIcon : channel === "ios" ? AppleIcon : channel === "email" ? MailIcon : SmartphoneIcon;
  return <Icon className={className} aria-label={label} role="img" />;
}

import { Link, Outlet } from "@tanstack/react-router";
import { BotIcon, BracesIcon, CodeIcon, KeyRoundIcon, MessageCircleIcon, MessageSquareTextIcon, ShieldCheckIcon, TagsIcon, UserRoundIcon, UsersIcon, UsersRoundIcon, type LucideIcon } from "lucide-react";
import { copy } from "@/lib/copy";
import type { SettingsSection } from "./section-names";

const GROUPS: { title: string; items: { section: SettingsSection; label: string; icon: LucideIcon }[] }[] = [
  {
    title: copy.settings.workspace,
    items: [
      { section: "assistant", label: copy.settings.sections.assistant, icon: BotIcon },
      { section: "messenger", label: copy.settings.sections.messenger, icon: MessageCircleIcon },
      { section: "install", label: copy.settings.sections.install, icon: CodeIcon },
      { section: "team", label: copy.settings.sections.team, icon: UsersIcon },
      { section: "teams", label: copy.teams.section, icon: UsersRoundIcon },
      { section: "saved-replies", label: copy.settings.sections.savedReplies, icon: MessageSquareTextIcon },
      { section: "tags-fields", label: copy.settings.sections.tagsFields, icon: TagsIcon },
      { section: "webhooks", label: copy.settings.sections.webhooks, icon: BracesIcon },
      { section: "api-keys", label: copy.settings.sections.apiKeys, icon: KeyRoundIcon },
      { section: "privacy", label: copy.settings.sections.privacy, icon: ShieldCheckIcon },
    ],
  },
  { title: copy.settings.personal, items: [{ section: "profile", label: copy.settings.sections.profile, icon: UserRoundIcon }] },
];

export function SettingsLayout() {
  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-52 shrink-0 flex-col gap-5 py-3 pr-2 md:flex xl:w-56">
        <h1 className="px-2 text-lg font-semibold tracking-tight">{copy.settings.title}</h1>
        {GROUPS.map((group) => (
          <nav key={group.title} className="flex flex-col gap-0.5">
            <p className="px-2.5 pb-1 text-xs font-medium text-muted-foreground">{group.title}</p>
            {group.items.map(({ section, label, icon: Icon }) => (
              <Link
                key={section}
                to="/settings/$section"
                params={{ section }}
                className="group flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground data-[status=active]:bg-card data-[status=active]:font-medium data-[status=active]:text-foreground data-[status=active]:shadow-xs"
              >
                <Icon className="size-4 group-data-[status=active]:text-primary" strokeWidth={1.8} />
                {label}
              </Link>
            ))}
          </nav>
        ))}
      </aside>
      <div className="my-2 mr-2 min-w-0 flex-1 overflow-y-auto rounded-xl border bg-card shadow-xs scrollbar-thin">
        <Outlet />
      </div>
    </div>
  );
}

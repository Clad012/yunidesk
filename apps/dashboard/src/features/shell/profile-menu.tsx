import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { KeyboardIcon, LogOutIcon, MonitorIcon, MoonIcon, SunIcon, UserRoundIcon } from "lucide-react";
import { copy } from "@/lib/copy";
import { endpoints } from "@/lib/endpoints";
import { realtime } from "@/lib/realtime/socket";
import { turnOffPush } from "@/features/push/push-device";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { setThemePreference, useTheme, type ThemePreference } from "@/hooks/use-theme";
import { PersonAvatar } from "@/components/person-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { shortcutsOpenStore } from "./shortcuts-store";

export function ProfileMenu() {
  const { agent } = useBootstrap();
  const { preference } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const logout = async () => {
    // A signed-out browser must not keep receiving the team's notifications.
    await turnOffPush().catch(() => undefined);
    await endpoints.logout().catch(() => undefined);
    realtime.stop();
    queryClient.clear();
    await navigate({ to: "/login" });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" aria-label={copy.nav.profile}>
        <PersonAvatar name={agent.name} avatarUrl={agent.avatarUrl} seed={agent.id} className="size-9" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="right" align="end" className="w-60">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span className="text-sm font-medium text-foreground">{agent.name}</span>
          <span className="truncate font-normal">{agent.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void navigate({ to: "/settings/$section", params: { section: "profile" } })}>
          <UserRoundIcon /> {copy.nav.profile}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => shortcutsOpenStore.set(true)}>
          <KeyboardIcon /> {copy.nav.shortcuts}
          <DropdownMenuShortcut>?</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{copy.nav.theme}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={preference} onValueChange={(v) => setThemePreference(v as ThemePreference)}>
          <DropdownMenuRadioItem value="light">
            <SunIcon /> {copy.nav.light}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark">
            <MoonIcon /> {copy.nav.dark}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system">
            <MonitorIcon /> {copy.nav.system}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void logout()}>
          <LogOutIcon /> {copy.nav.logout}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

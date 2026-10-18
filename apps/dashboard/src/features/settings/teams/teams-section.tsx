import { copy } from "@/lib/copy";
import { SettingsPage } from "../settings-page";
import { CapacityCard } from "./capacity-card";
import { FallbackCard } from "./fallback-card";
import { RulesCard } from "./rules-card";
import { TeamsCard } from "./teams-card";

export function TeamsSection() {
  return (
    <SettingsPage title={copy.teams.title} subtitle={copy.teams.subtitle}>
      <TeamsCard />
      <RulesCard />
      <FallbackCard />
      <CapacityCard />
    </SettingsPage>
  );
}

import { useParams } from "@tanstack/react-router";
import { settingsComponents } from "./sections";
import type { SettingsSection } from "./section-names";

export function SettingsSectionPage() {
  const { section } = useParams({ from: "/app/settings/$section" }) as { section: SettingsSection };
  const Section = settingsComponents[section];
  return <Section />;
}

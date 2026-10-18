import { copy } from "@/lib/copy";
import { SettingsPage } from "../settings-page";
import { FieldsCard } from "./fields-card";
import { TagsCard } from "./tags-card";

export function TagsFieldsSection() {
  return (
    <SettingsPage title={copy.tagsFields.title} subtitle={copy.tagsFields.subtitle}>
      <TagsCard />
      <FieldsCard />
    </SettingsPage>
  );
}

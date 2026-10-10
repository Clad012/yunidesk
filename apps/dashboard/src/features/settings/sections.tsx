import type { ComponentType } from "react";
import { InstallSection } from "./install/install-section";
import { MessengerSection } from "./messenger/messenger-section";
import { PrivacySection } from "./privacy/privacy-section";
import { ProfileSection } from "./profile/profile-section";
import { SavedRepliesSection } from "./saved-replies/saved-replies-section";
import { TeamSection } from "./team/team-section";
import { WebhooksSection } from "./webhooks/webhooks-section";

import type { SettingsSection } from "./section-names";

export const settingsComponents: Record<SettingsSection, ComponentType> = {
  messenger: MessengerSection,
  install: InstallSection,
  team: TeamSection,
  "saved-replies": SavedRepliesSection,
  webhooks: WebhooksSection,
  privacy: PrivacySection,
  profile: ProfileSection,
};

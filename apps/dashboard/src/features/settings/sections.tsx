import type { ComponentType } from "react";
import { ApiKeysSection } from "./api-keys/api-keys-section";
import { AssistantSection } from "./assistant/assistant-section";
import { BusinessHoursSection } from "./business-hours/business-hours-section";
import { InstallSection } from "./install/install-section";
import { MessengerSection } from "./messenger/messenger-section";
import { PrivacySection } from "./privacy/privacy-section";
import { ProfileSection } from "./profile/profile-section";
import { SavedRepliesSection } from "./saved-replies/saved-replies-section";
import { TeamSection } from "./team/team-section";
import { WebhooksSection } from "./webhooks/webhooks-section";

import type { SettingsSection } from "./section-names";

export const settingsComponents: Record<SettingsSection, ComponentType> = {
  assistant: AssistantSection,
  messenger: MessengerSection,
  install: InstallSection,
  team: TeamSection,
  "saved-replies": SavedRepliesSection,
  webhooks: WebhooksSection,
  "api-keys": ApiKeysSection,
  privacy: PrivacySection,
  profile: ProfileSection,
  "business-hours": BusinessHoursSection,
};

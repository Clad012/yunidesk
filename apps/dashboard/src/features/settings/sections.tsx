import type { ComponentType } from "react";
import { ApiKeysSection } from "./api-keys/api-keys-section";
import { AssistantSection } from "./assistant/assistant-section";
import { BusinessHoursSection } from "./business-hours/business-hours-section";
import { EmailSection } from "./email/email-section";
import { AuditLogSection } from "./audit-log/audit-log-section";
import { InstallSection } from "./install/install-section";
import { MessengerSection } from "./messenger/messenger-section";
import { PrivacySection } from "./privacy/privacy-section";
import { ProfileSection } from "./profile/profile-section";
import { SavedRepliesSection } from "./saved-replies/saved-replies-section";
import { TagsFieldsSection } from "./tags-fields/tags-fields-section";
import { SecuritySection } from "./security/security-section";
import { TeamSection } from "./team/team-section";
import { TeamsSection } from "./teams/teams-section";
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
  "tags-fields": TagsFieldsSection,
  teams: TeamsSection,
  "business-hours": BusinessHoursSection,
  email: EmailSection,
  "audit-log": AuditLogSection,
  security: SecuritySection,
};

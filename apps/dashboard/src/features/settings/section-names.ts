export const SETTINGS_SECTIONS = ["assistant", "messenger", "install", "team", "saved-replies", "webhooks", "api-keys", "privacy", "profile", "tags-fields", "business-hours", "email"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

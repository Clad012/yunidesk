export const SETTINGS_SECTIONS = ["messenger", "install", "team", "saved-replies", "webhooks", "api-keys", "privacy", "profile"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

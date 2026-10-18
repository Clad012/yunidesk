export const SETTINGS_SECTIONS = ["assistant", "messenger", "install", "team", "saved-replies", "webhooks", "api-keys", "privacy", "profile", "email"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

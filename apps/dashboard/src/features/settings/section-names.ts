export const SETTINGS_SECTIONS = ["messenger", "install", "team", "saved-replies", "webhooks", "privacy", "profile"] as const;
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

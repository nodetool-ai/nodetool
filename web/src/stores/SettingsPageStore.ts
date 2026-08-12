// SettingsPageStore.ts
// -----------------------------------------------------------------
// Which section the Settings page shows. Settings used to be a route
// and kept the section in `?tab=<n>`; it is a workspace tab now, so
// the selection lives here — a caller that wants a specific section
// (e.g. "open the provider keys") sets it before opening the tab.
// -----------------------------------------------------------------

import { create } from "zustand";

export const SETTINGS_SECTIONS = [
  "general",
  "providers",
  "integrations",
  "about"
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

interface SettingsPageState {
  section: SettingsSection;
  setSection: (section: SettingsSection) => void;
}

export const useSettingsPageStore = create<SettingsPageState>((set) => ({
  section: "general",
  setSection: (section) => set({ section })
}));

import { create } from "zustand";
import { client } from "./ApiClient";
import { createErrorMessage } from "../utils/errorHandling";
import { components } from "../api";

type SettingWithValue = components["schemas"]["SettingWithValue"];

interface RemoteSettingsStore {
  settings: SettingWithValue[];
  settingsByGroup: Map<string, SettingWithValue[]>;
  isLoading: boolean;
  error: string | null;
  fetchSettings: () => Promise<SettingWithValue[]>;
  updateSettings: (
    settings: Record<string, string>
  ) => Promise<void>;
  getSettingValue: (envVar: string) => string | undefined;
  setSettingValue: (envVar: string, value: string) => void;
}

const useRemoteSettingsStore = create<RemoteSettingsStore>((set, get) => ({
  settings: [],
  settingsByGroup: new Map(),
  isLoading: false,
  error: null,

  fetchSettings: async () => {
    const { error, data } = await client.GET("/api/settings/", {});
    if (error) {
      throw createErrorMessage(error, "Failed to load settings");
    }

    // Group settings by their group field
    const settingsByGroup = new Map<string, SettingWithValue[]>();
    data.settings.forEach((setting) => {
      const group = setting.group;
      if (!settingsByGroup.has(group)) {
        settingsByGroup.set(group, []);
      }
      settingsByGroup.get(group)!.push(setting);
    });

    set({
      settings: data.settings,
      settingsByGroup,
      isLoading: false
    });

    return data.settings;
  },

  updateSettings: async (
    settings: Record<string, string>
  ) => {
    set({ isLoading: true, error: null });
    const { error, data } = await client.PUT("/api/settings/", {
      body: {
        settings: settings as Record<string, never>,
        secrets: {} as Record<string, never>
      }
    });
    if (error) {
      throw createErrorMessage(error, "Failed to update settings");
    }
    set({ isLoading: false });
  },

  getSettingValue: (envVar: string) => {
    const setting = get().settings.find(s => s.env_var === envVar);
    return setting?.value !== null && setting?.value !== undefined 
      ? String(setting.value) 
      : undefined;
  },

  setSettingValue: (envVar: string, value: string) => {
    set(state => ({
      settings: state.settings.map(s => 
        s.env_var === envVar 
          ? { ...s, value } 
          : s
      )
    }));
  }
}));

export default useRemoteSettingsStore;

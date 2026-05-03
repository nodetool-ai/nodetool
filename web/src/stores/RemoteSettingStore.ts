import { create } from "zustand";
import { trpcClient } from "../trpc/client";
import { createErrorMessage } from "../utils/errorHandling";
import type { SettingWithValue } from "./ApiTypes";

export type { SettingWithValue };

interface RemoteSettingsStore {
  settings: SettingWithValue[];
  settingsByGroup: Map<string, SettingWithValue[]>;
  isLoading: boolean;
  error: string | null;
  fetchSettings: () => Promise<SettingWithValue[]>;
  updateSettings: (
    settings: Record<string, string>,
    secrets?: Record<string, string>
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
    try {
      const data = await trpcClient.settings.list.query();
      const settings = data.settings as SettingWithValue[];

      // Group settings by their group field
      const settingsByGroup = new Map<string, SettingWithValue[]>();
      settings.forEach((setting) => {
        const group = setting.group;
        if (!settingsByGroup.has(group)) {
          settingsByGroup.set(group, []);
        }
        settingsByGroup.get(group)!.push(setting);
      });

      set({
        settings,
        settingsByGroup,
        isLoading: false
      });

      return settings;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      throw createErrorMessage(error, "Failed to load settings");
    }
  },

  updateSettings: async (
    settings: Record<string, string>,
    secrets: Record<string, string> = {}
  ) => {
    set({ isLoading: true, error: null });
    try {
      await trpcClient.settings.update.mutate({
        settings,
        secrets
      });
      set({ isLoading: false });
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      set({ isLoading: false });
      throw createErrorMessage(error, "Failed to update settings");
    }
  },

  getSettingValue: (envVar: string) => {
    const setting = get().settings.find((s) => s.env_var === envVar);
    return setting?.value != null
      ? String(setting.value)
      : undefined;
  },

  setSettingValue: (envVar: string, value: string) => {
    set((state) => {
      const index = state.settings.findIndex((s) => s.env_var === envVar);
      if (index === -1) return state;

      const newSettings = [...state.settings];
      newSettings[index] = { ...newSettings[index], value };

      return { settings: newSettings };
    });
  }
}));

export default useRemoteSettingsStore;

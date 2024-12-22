import { create } from "zustand";
import { client } from "./ApiClient";
import { SecretsModel, SettingsModel } from "./ApiTypes";
import { createErrorMessage } from "../utils/errorHandling";

interface SettingsResponse {
  settings: SettingsModel;
  secrets: SecretsModel;
}

interface RemoteSettingsStore {
  settings: SettingsModel;
  secrets: SecretsModel;
  isLoading: boolean;
  error: string | null;
  fetchSettings: () => Promise<SettingsResponse>;
  updateSettings: (
    settings: SettingsModel,
    secrets: SecretsModel
  ) => Promise<void>;
}

const useRemoteSettingsStore = create<RemoteSettingsStore>((set, get) => ({
  settings: {},
  secrets: {},
  isLoading: false,
  error: null,

  fetchSettings: async () => {
    const { error, data } = await client.GET("/api/settings/", {});
    if (error) {
      throw createErrorMessage(error, "Failed to load settings");
    }
    set({ settings: data.settings, secrets: data.secrets, isLoading: false });
    return data;
  },

  updateSettings: async (settings: SettingsModel, secrets: SecretsModel) => {
    set({ isLoading: true, error: null });
    const { error, data } = await client.PUT("/api/settings/", {
      body: {
        settings: settings,
        secrets: secrets
      }
    });
    if (error) {
      throw createErrorMessage(error, "Failed to update settings");
    }
    set({ settings: data.settings, secrets: data.secrets, isLoading: false });
  }
}));

export default useRemoteSettingsStore;

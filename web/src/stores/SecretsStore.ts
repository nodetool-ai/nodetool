import { create } from "zustand";
import { trpcClient } from "../trpc/client";
import { createErrorMessage } from "../utils/errorHandling";
import { SecretResponse } from "./ApiTypes";

interface SecretsStore {
  secrets: SecretResponse[];
  isLoading: boolean;
  error: string | null;
  fetchSecrets: (limit?: number) => Promise<SecretResponse[]>;
  getSecretValue: (key: string) => Promise<string | null>;
  updateSecret: (key: string, value: string, description?: string) => Promise<void>;
  deleteSecret: (key: string) => Promise<void>;
}

const useSecretsStore = create<SecretsStore>((set, get) => ({
  secrets: [],
  isLoading: false,
  error: null,

  // Note: the `limit` parameter is retained for signature compatibility with
  // existing callers, but the tRPC `settings.secrets.list` procedure does not
  // accept a limit (it returns the full registry + DB merge in one shot).
  fetchSecrets: async (_limit = 100) => {
    set({ isLoading: true, error: null });
    try {
      const data = await trpcClient.settings.secrets.list.query();
      const secrets = data.secrets as SecretResponse[];
      set({ secrets, isLoading: false });
      return secrets;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      set({
        error: createErrorMessage(error, "Failed to load secrets").message,
        isLoading: false
      });
      throw error;
    }
  },

  getSecretValue: async (key: string) => {
    try {
      const data = await trpcClient.settings.secrets.get.query({
        key,
        decrypt: true
      });
      return typeof data.value === "string" ? data.value : null;
    } catch {
      return null;
    }
  },

  updateSecret: async (key: string, value: string, description?: string) => {
    set({ error: null });
    try {
      await trpcClient.settings.secrets.upsert.mutate({
        key,
        value,
        ...(description !== undefined ? { description } : {})
      });
      // Refresh secrets list
      await get().fetchSecrets();
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      set({
        error: createErrorMessage(error, "Failed to update secret").message
      });
      throw error;
    }
  },

  deleteSecret: async (key: string) => {
    set({ error: null });
    try {
      await trpcClient.settings.secrets.delete.mutate({ key });
      // Refresh secrets list
      await get().fetchSecrets();
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      set({
        error: createErrorMessage(error, "Failed to delete secret").message
      });
      throw error;
    }
  }
}));

export default useSecretsStore;

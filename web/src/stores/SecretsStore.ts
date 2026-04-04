import { create } from "zustand";
import { client } from "./ApiClient";
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

  fetchSecrets: async (limit = 100) => {
    set({ isLoading: true, error: null });
    try {
      const { error, data } = await client.GET("/api/settings/secrets", {
        params: {
          query: {
            limit,
          }
        }
      });

      if (error) {
        throw createErrorMessage(error, "Failed to load secrets");
      }

      set({
        secrets: data.secrets,
        isLoading: false
      });

      return data.secrets;
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      set({
        error: error.message || "Failed to load secrets",
        isLoading: false
      });
      throw error;
    }
  },


  getSecretValue: async (key: string) => {
    try {
      const { error, data } = await client.GET("/api/settings/secrets/{key}", {
        params: { path: { key } }
      });
      if (error) return null;
      const record = data as Record<string, unknown>;
      return typeof record.value === "string" ? record.value : null;
    } catch {
      return null;
    }
  },

  updateSecret: async (key: string, value: string, description?: string) => {
    set({ error: null });
    try {
      const { error } = await client.PUT("/api/settings/secrets/{key}", {
        params: {
          path: {
            key
          }
        },
        body: {
          value,
          description
        }
      });

      if (error) {
        throw createErrorMessage(error, "Failed to update secret");
      }

      // Refresh secrets list
      await get().fetchSecrets();
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      set({ error: error.message || "Failed to update secret" });
      throw error;
    }
  },

  deleteSecret: async (key: string) => {
    set({ error: null });
    try {
      const { error } = await client.DELETE("/api/settings/secrets/{key}", {
        params: {
          path: {
            key
          }
        }
      });

      if (error) {
        throw createErrorMessage(error, "Failed to delete secret");
      }

      // Refresh secrets list
      await get().fetchSecrets();
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      set({ error: error.message || "Failed to delete secret" });
      throw error;
    }
  }

}));

export default useSecretsStore;

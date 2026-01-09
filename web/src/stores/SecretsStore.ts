import { create } from "zustand";
import { client } from "./ApiClient";
import { createErrorMessage } from "../utils/errorHandling";
import { SecretResponse } from "./ApiTypes";

interface SecretsStore {
  secrets: SecretResponse[];
  isLoading: boolean;
  error: string | null;
  fetchSecrets: (limit?: number) => Promise<SecretResponse[]>;
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
    } catch (err: any) {
      set({
        error: err.message || "Failed to load secrets",
        isLoading: false
      });
      throw err;
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
    } catch (err: any) {
      set({ error: err.message || "Failed to update secret" });
      throw err;
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
    } catch (err: any) {
      set({ error: err.message || "Failed to delete secret" });
      throw err;
    }
  }

}));

export default useSecretsStore;

/**
 * Manages API keys and secrets securely.
 *
 * Provides CRUD operations for user API keys (OpenAI, Anthropic, etc.)
 * and other sensitive credentials. Secrets are stored on the server
 * and never exposed to the client beyond what's needed for operation.
 *
 * Features:
 * - Fetch secrets list with pagination
 * - Create/update secrets with optional descriptions
 * - Delete secrets
 * - Error handling with proper type guards
 * - Loading and error states for UI feedback
 *
 * @example
 * ```typescript
 * import useSecretsStore from './SecretsStore';
 *
 * const store = useSecretsStore();
 * await store.updateSecret('openai_api_key', 'sk-...', 'OpenAI API Key');
 * await store.fetchSecrets();
 * ```
 */
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
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      set({
        error: error.message || "Failed to load secrets",
        isLoading: false
      });
      throw error;
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

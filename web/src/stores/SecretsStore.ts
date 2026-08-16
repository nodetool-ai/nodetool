import { create } from "zustand";
import { trpcClient } from "../trpc/client";
import { createErrorMessage } from "../utils/errorHandling";
import { SecretResponse } from "./ApiTypes";
import { queryClient } from "../queryClient";

/**
 * What the server learned by probing a credential. `unverifiable` is its own
 * answer on purpose — a provider NodeTool has no cheap check for, or one that
 * did not answer, must not read as a working key.
 */
export interface SecretValidation {
  status: "valid" | "invalid" | "unverifiable";
  valid: boolean;
  message: string;
}

interface SecretsStore {
  secrets: SecretResponse[];
  isLoading: boolean;
  error: string | null;
  fetchSecrets: (limit?: number) => Promise<SecretResponse[]>;
  getSecretValue: (key: string) => Promise<string | null>;
  /** Alias for getSecretValue – returns the decrypted secret value or null. */
  fetchDecryptedSecret: (key: string) => Promise<string | null>;
  updateSecret: (
    key: string,
    value: string,
    description?: string
  ) => Promise<void>;
  deleteSecret: (key: string) => Promise<void>;
  /**
   * Ask the server to probe a credential. Omit `value` to test the key already
   * stored. Never rejects — a failed probe is a result.
   */
  validateSecret: (key: string, value?: string) => Promise<SecretValidation>;
}

// Provider availability is derived from configured secrets, and downstream
// model lists are scoped to those providers. Whenever a secret is added,
// changed, or removed, every cache that depends on the resulting provider
// set must be refreshed so model dialogs reflect the new provider without
// requiring a page reload.
const invalidateProviderDependentCaches = (): void => {
  queryClient.invalidateQueries({ queryKey: ["secrets"] });
  queryClient.invalidateQueries({ queryKey: ["providers"] });
  queryClient.invalidateQueries({ queryKey: ["language-models"] });
  queryClient.invalidateQueries({ queryKey: ["embedding-models"] });
  queryClient.invalidateQueries({ queryKey: ["image-models"] });
  queryClient.invalidateQueries({ queryKey: ["tts-models"] });
  queryClient.invalidateQueries({ queryKey: ["asr-models"] });
  queryClient.invalidateQueries({ queryKey: ["video-models"] });
};

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

  fetchDecryptedSecret: async (key: string) => {
    return get().getSecretValue(key);
  },

  updateSecret: async (key: string, value: string, description?: string) => {
    set({ error: null });
    try {
      const input: Parameters<
        typeof trpcClient.settings.secrets.upsert.mutate
      >[0] = { key, value };
      if (description !== undefined) input.description = description;
      await trpcClient.settings.secrets.upsert.mutate(input);
      await get().fetchSecrets();
      invalidateProviderDependentCaches();
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
      invalidateProviderDependentCaches();
    } catch (err: unknown) {
      const error = err instanceof Error ? err : new Error(String(err));
      set({
        error: createErrorMessage(error, "Failed to delete secret").message
      });
      throw error;
    }
  },

  validateSecret: async (key: string, value?: string) => {
    try {
      const input: Parameters<
        typeof trpcClient.settings.secrets.validate.mutate
      >[0] = { key };
      if (value !== undefined) input.value = value;
      return await trpcClient.settings.secrets.validate.mutate(input);
    } catch {
      // The server was unreachable, which says nothing about the key itself.
      return {
        status: "unverifiable" as const,
        valid: false,
        message: "Couldn't reach the server to check the key."
      };
    }
  }
}));

export default useSecretsStore;

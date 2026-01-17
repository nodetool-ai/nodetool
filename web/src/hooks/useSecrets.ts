import { useQuery } from "@tanstack/react-query";
import useSecretsStore from "../stores/SecretsStore";
import { useCallback } from "react";

/**
 * Hook to fetch and manage API secrets (API keys) from the backend.
 * 
 * Provides cached access to user-stored secrets for various AI providers.
 * The secrets are stored securely and fetched via the SecretsStore.
 * 
 * @returns Object containing:
 *   - secrets: Array of stored secrets with key and value
 *   - isLoading: Loading state for the query
 *   - isSuccess: Whether the query completed successfully
 *   - isApiKeySet: Callback function to check if a specific API key is configured
 * 
 * @example
 * ```typescript
 * const { secrets, isLoading, isApiKeySet } = useSecrets();
 * 
 * const hasOpenAI = isApiKeySet("openai_api_key");
 * if (hasOpenAI) {
 *   console.log("OpenAI API key is configured");
 * }
 * ```
 */
export const useSecrets = () => {
  const { data: secrets = [], isLoading, isSuccess } = useQuery({
    queryKey: ["secrets"],
    queryFn: () => useSecretsStore.getState().fetchSecrets()
  });

  const isApiKeySet = useCallback((key: string) => {
    return secrets.find((secret) => secret.key === key) !== undefined;
  }, [secrets]);

  return { secrets, isLoading, isSuccess, isApiKeySet };
};
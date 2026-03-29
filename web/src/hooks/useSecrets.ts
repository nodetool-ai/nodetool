import { useQuery } from "@tanstack/react-query";
import useSecretsStore from "../stores/SecretsStore";
import { useCallback } from "react";

/**
 * Hook to fetch and manage API secrets (API keys) from the backend.
 *
 * @example
 * const { secrets, isApiKeySet } = useSecrets();
 * if (isApiKeySet("openai_api_key")) {
 *   console.log("OpenAI API key exists for this user");
 * }
 */
export const useSecrets = () => {
  const {
    data: secrets = [],
    isLoading,
    isSuccess
  } = useQuery({
    queryKey: ["secrets"],
    queryFn: () => useSecretsStore.getState().fetchSecrets(),
    staleTime: 30000 // Consider data fresh for 30 seconds
  });

  /**
   * Returns true if the user has this key in their secrets list (regardless of
   * whether it has been configured with a value). Use the `is_configured` field
   * on the returned secret object if you need to check for an actual value.
   */
  const isApiKeySet = useCallback(
    (key: string) => {
      return secrets.some((s) => s.key === key);
    },
    [secrets]
  );

  return { secrets, isLoading, isSuccess, isApiKeySet };
};

import { useQuery } from "@tanstack/react-query";
import useSecretsStore from "../stores/SecretsStore";
import { useCallback } from "react";

/**
 * Hook to fetch and manage API secrets (API keys) from the backend.
 *
 * @example
 * const { secrets, isApiKeySet } = useSecrets();
 * if (isApiKeySet("openai_api_key")) {
 *   console.log("OpenAI API key is configured");
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

  const isApiKeySet = useCallback(
    (key: string) => {
      return secrets.find((secret) => secret.key === key) !== undefined;
    },
    [secrets]
  );

  return { secrets, isLoading, isSuccess, isApiKeySet };
};

import { useQuery } from "@tanstack/react-query";
import useSecretsStore from "../stores/SecretsStore";
import { SecretResponse } from "../stores/ApiTypes";
import { useCallback } from "react";

interface UseSecretsResult {
  secrets: SecretResponse[];
  isLoading: boolean;
  isSuccess: boolean;
  isApiKeySet: (key: string) => boolean;
}

/** Fetch and manage API secrets (API keys) from the backend. */
export const useSecrets = (): UseSecretsResult => {
  const {
    data: secrets = [],
    isLoading,
    isSuccess
  } = useQuery({
    queryKey: ["secrets"],
    queryFn: () => useSecretsStore.getState().fetchSecrets(),
    staleTime: 30000
  });

  /**
   * Returns true if the key has a value: stored for the user, or set in the
   * server's environment. The list also holds unconfigured catalog rows.
   */
  const isApiKeySet = useCallback(
    (key: string) => {
      return secrets.some((s) => s.key === key && s.is_configured);
    },
    [secrets]
  );

  return { secrets, isLoading, isSuccess, isApiKeySet };
};

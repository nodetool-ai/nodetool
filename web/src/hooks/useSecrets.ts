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

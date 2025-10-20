import { useQuery } from "@tanstack/react-query";
import useSecretsStore from "../stores/SecretsStore";
import { useCallback } from "react";

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
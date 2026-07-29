import { useMemo } from "react";
import { useSecrets } from "./useSecrets";
import {
  getRequiredSecretKeyForNamespace,
  getSecretDisplayName
} from "../utils/nodeProvider";

/**
 * Hook to validate if required API key exists for a node namespace
 * @param nodeNamespace - The namespace of the node (e.g., "openai.chat", "anthropic.complete")
 * @returns The missing API key display name if not found, or null if found
 */
export const useApiKeyValidation = (nodeNamespace: string): string | null => {
  const { isApiKeySet, isLoading } = useSecrets();

  return useMemo(() => {
    if (isLoading) {
      return null;
    }

    const requiredSecretKey = getRequiredSecretKeyForNamespace(nodeNamespace);
    if (!requiredSecretKey) {
      return null;
    }

    if (!isApiKeySet(requiredSecretKey)) {
      return getSecretDisplayName(requiredSecretKey);
    }

    return null;
  }, [nodeNamespace, isApiKeySet, isLoading]);
};

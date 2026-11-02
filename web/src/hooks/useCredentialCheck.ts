import { useCallback, useMemo } from "react";
import { useSecrets } from "./useSecrets";
import { useProviders } from "./useProviders";
import { getProviderIdForGateKey } from "../utils/nodeProvider";

export interface CredentialCheck {
  /**
   * True when a namespace gate key is satisfied: its secret is stored, or,
   * for a sign-in or machine credential, the server offers its provider.
   */
  isCredentialSet: (key: string) => boolean;
  isLoading: boolean;
}

/**
 * Whether the credential behind a node namespace is in place. Codex and
 * Claude Code sign in instead of storing a key, and Vertex AI can use the
 * machine's `gcloud` login, so the secrets list alone would hide their nodes.
 */
export const useCredentialCheck = (): CredentialCheck => {
  const { isApiKeySet, isLoading: secretsLoading } = useSecrets();
  const { providers, isLoading: providersLoading } = useProviders();

  const available = useMemo(
    () => new Set(providers.map((p) => p.provider)),
    [providers]
  );

  const isCredentialSet = useCallback(
    (key: string) => {
      if (isApiKeySet(key)) return true;
      const providerId = getProviderIdForGateKey(key);
      return providerId !== null && available.has(providerId);
    },
    [isApiKeySet, available]
  );

  return { isCredentialSet, isLoading: secretsLoading || providersLoading };
};

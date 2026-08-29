import { useEffect, useMemo } from "react";
import useSecretsStore from "../stores/SecretsStore";
import { useOAuthConnection } from "./useOAuthConnection";
import { AI_PROVIDER_SECRET_KEYS } from "../components/menus/providerCatalog";

/**
 * Whether at least one AI provider is connected. Drives the "connect a
 * provider" onboarding step wherever it is shown (the new-project surface's
 * checklist, chat welcome), so every surface reads the same signal.
 *
 * A provider counts when its secret is configured — the key set comes from the
 * settings provider catalog, so a provider connected anywhere in the app ticks
 * the step — or when its OAuth flow is signed in, which stores tokens rather
 * than a secret and would otherwise look unconnected.
 */
export const useHasConfiguredProvider = (): boolean => {
  const fetchSecrets = useSecretsStore((s) => s.fetchSecrets);
  const secrets = useSecretsStore((s) => s.secrets);

  const openai = useOAuthConnection("openai");
  const hf = useOAuthConnection("hf");
  const claude = useOAuthConnection("claude");

  useEffect(() => {
    fetchSecrets();
  }, [fetchSecrets]);

  const hasSecret = useMemo(
    () =>
      secrets.some(
        (s) => AI_PROVIDER_SECRET_KEYS.has(s.key) && s.is_configured
      ),
    [secrets]
  );

  return (
    hasSecret || openai.isConnected || hf.isConnected || claude.isConnected
  );
};

export default useHasConfiguredProvider;

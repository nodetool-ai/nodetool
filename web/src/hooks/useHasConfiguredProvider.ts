import { useEffect, useMemo } from "react";
import useSecretsStore from "../stores/SecretsStore";
import { AI_PROVIDER_SECRET_KEYS } from "../components/menus/providerCatalog";

/**
 * Whether at least one AI provider is connected. Drives the "connect a
 * provider" onboarding step wherever it is shown (the new-project surface's
 * checklist, chat welcome), so every surface reads the same signal.
 *
 * A provider counts only when its secret is configured in NodeTool's settings
 * database. External OAuth credentials, such as Claude Code credentials, do
 * not complete this step.
 */
export const useHasConfiguredProvider = (): boolean => {
  const fetchSecrets = useSecretsStore((s) => s.fetchSecrets);
  const secrets = useSecretsStore((s) => s.secrets);

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

  return hasSecret;
};

export default useHasConfiguredProvider;

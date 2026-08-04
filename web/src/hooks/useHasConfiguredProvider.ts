import { useEffect, useMemo } from "react";
import useSecretsStore from "../stores/SecretsStore";

// Secret keys the runtime providers actually read (see
// packages/runtime/src/providers — e.g. GeminiProvider requires
// GEMINI_API_KEY, HuggingFaceProvider requires HF_TOKEN).
export const KNOWN_PROVIDER_KEYS = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "HF_TOKEN"
];

/**
 * Whether at least one AI provider is configured. Drives the "connect a
 * provider" onboarding step wherever it is shown (dashboard checklist, empty
 * workspace), so both surfaces read the same secrets.
 */
export const useHasConfiguredProvider = (): boolean => {
  const fetchSecrets = useSecretsStore((s) => s.fetchSecrets);
  const secrets = useSecretsStore((s) => s.secrets);

  useEffect(() => {
    fetchSecrets();
  }, [fetchSecrets]);

  return useMemo(
    () =>
      secrets.some(
        (s) => KNOWN_PROVIDER_KEYS.includes(s.key) && s.is_configured
      ),
    [secrets]
  );
};

export default useHasConfiguredProvider;

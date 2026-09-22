import { useLanguageModelsByProvider } from "./useModelsByProvider";

export interface LanguageProviderReadiness {
  ready: boolean;
  loading: boolean;
}

/**
 * Whether a language task has a model it can use. Drives the "connect a
 * provider" onboarding step wherever it is shown (the new-project surface's
 * checklist, chat welcome), so every surface reads the same signal.
 *
 * The model catalog is the readiness boundary: it includes external OAuth
 * providers and local models, while media-only providers do not appear in the
 * language model list. An unresolved catalog must not look like an empty one,
 * or a start action can show a setup prompt while discovery is still running.
 */
export const useLanguageProviderReadiness = (): LanguageProviderReadiness => {
  const { models, isLoading, isFetching } =
    useLanguageModelsByProvider({ requireToolSupport: true });

  return {
    ready: models.length > 0,
    loading: isLoading || isFetching
  };
};

export const useHasConfiguredProvider = (): boolean =>
  useLanguageProviderReadiness().ready;

export default useHasConfiguredProvider;

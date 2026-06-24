import { useCallback } from "react";
import useModelPreferencesStore from "../stores/ModelPreferencesStore";
import { useSecrets } from "./useSecrets";
import {
  requiredSecretForProvider,
  ModelSelectorModel
} from "../stores/ModelMenuStore";

interface ModelAvailability {
  /** Provider is enabled and (if required) its API key is configured. */
  available: boolean;
  providerEnabled: boolean;
  hasKey: boolean;
}

/**
 * Returns a predicate that reports whether a model can currently be used.
 * A model is available when its provider is enabled and any required API key
 * is configured. Shared between the model list (row state) and the menu
 * dialog (keyboard navigation skips unavailable rows).
 */
export const useModelAvailability = (): ((
  model: Pick<ModelSelectorModel, "provider">
) => ModelAvailability) => {
  const enabledProviders = useModelPreferencesStore((s) => s.enabledProviders);
  const { isApiKeySet } = useSecrets();

  return useCallback(
    (model: Pick<ModelSelectorModel, "provider">): ModelAvailability => {
      const provider = model.provider || "";
      const env = requiredSecretForProvider(model.provider);
      const normKey = /gemini|google/i.test(provider) ? "gemini" : provider;
      const providerEnabled = enabledProviders?.[normKey] !== false;
      const hasKey = env ? isApiKeySet(env) : true;
      return { available: providerEnabled && hasKey, providerEnabled, hasKey };
    },
    [enabledProviders, isApiKeySet]
  );
};

/**
 * The language model to offer after a provider failure, from the models the
 * user's pickers already list. Refused models are already out of that list.
 */
import { useMemo } from "react";
import type { LanguageModel } from "../stores/ApiTypes";
import { useLanguageModelsByProvider } from "./useModelsByProvider";
import {
  pickAlternativeModel,
  type ProviderFailureSummary
} from "../utils/providerFailure";

export function useAlternativeLanguageModel(
  failure: ProviderFailureSummary | null,
  options: {
    current?: LanguageModel | null;
    allowedProviders?: string[];
    requireToolSupport?: boolean;
  } = {}
): LanguageModel | undefined {
  const { models } = useLanguageModelsByProvider({
    allowedProviders: options.allowedProviders,
    requireToolSupport: options.requireToolSupport
  });
  const current = options.current;
  return useMemo(() => {
    if (!failure?.switchModel) {
      return undefined;
    }
    return pickAlternativeModel(models, {
      category: failure.category,
      // The failure names what the provider refused. Without a name, the
      // model the surface was using is the one that failed.
      provider: failure.provider ?? current?.provider,
      model: failure.model ?? current?.id
    });
  }, [failure, models, current]);
}

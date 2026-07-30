import { useCallback, useMemo } from "react";
import { trpc } from "../lib/trpc";
import type { EmbeddingModel } from "../stores/ApiTypes";
import { useEmbeddingProviders } from "./useProviders";
import {
  useAggregatedProviderModels,
  type ModelsByProviderResult
} from "./useModelsByProvider";

/**
 * Fetch embedding models from all configured (optionally filtered) providers in
 * parallel, grouped by provider.
 */
export const useEmbeddingModelsByProvider = (options?: {
  allowedProviders?: string[];
}): ModelsByProviderResult<EmbeddingModel> => {
  const { providers: allProviders, isLoading: providersLoading } =
    useEmbeddingProviders();

  const providers = useMemo(() => {
    if (!options?.allowedProviders) {return allProviders;}
    const lowerAllowed = options.allowedProviders.map((p) => p.toLowerCase());
    return allProviders.filter((p) =>
      lowerAllowed.includes(p.provider.toLowerCase())
    );
  }, [allProviders, options?.allowedProviders]);

  const fetchModels = useCallback(
    async (provider: string) =>
      ((await trpc.models.embeddingByProvider.query({ provider })) ||
        []) as EmbeddingModel[],
    []
  );

  const aggregated = useAggregatedProviderModels(
    providers,
    providersLoading,
    "embedding-models",
    fetchModels
  );

  const providerIds = useMemo(
    () => providers.map((p) => p.provider),
    [providers]
  );

  const isLoading = providersLoading || aggregated.isLoading;
  return useMemo(
    () => ({
      models: aggregated.models,
      providers: providerIds,
      isLoading,
      isFetching: aggregated.isFetching,
      error: aggregated.error,
      refetch: aggregated.refetch
    }),
    [aggregated, providerIds, isLoading]
  );
};

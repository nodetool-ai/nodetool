import { useCallback, useMemo } from "react";
import { trpc } from "../lib/trpc";
import type { RerankModel } from "../stores/ApiTypes";
import { useRerankProviders } from "./useProviders";
import {
  useAggregatedProviderModels,
  type ModelsByProviderResult
} from "./useModelsByProvider";

/** Fetch reranking models from every provider that can rerank, in parallel. */
export const useRerankModelsByProvider =
  (): ModelsByProviderResult<RerankModel> => {
    const { providers, isLoading: providersLoading } = useRerankProviders();

    const fetchModels = useCallback(
      async (provider: string) =>
        ((await trpc.models.rerankByProvider.query({ provider })) ||
          []) as RerankModel[],
      []
    );

    const aggregated = useAggregatedProviderModels(
      providers,
      providersLoading,
      "rerank-models",
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

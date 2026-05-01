import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { trpc } from "../lib/trpc";
import type { EmbeddingModel } from "../stores/ApiTypes";
import { useEmbeddingProviders } from "./useProviders";

/**
 * Custom hook for fetching embedding models grouped by provider.
 * 
 * Uses TanStack Query's useQueries to parallel fetch embedding models
 * from all configured embedding providers. Provides loading states
 * and error handling for the model list.
 * 
 * @param options - Optional configuration including provider filtering
 * @returns Object containing models array, loading states, and error info
 * 
 * @example
 * ```typescript
 * const { models, isLoading, error } = useEmbeddingModelsByProvider({
 *   allowedProviders: ["openai", "cohere"]
 * });
 * ```
 */
export const useEmbeddingModelsByProvider = (options?: {
  allowedProviders?: string[];
}) => {
  const { providers: allProviders, isLoading: providersLoading } =
    useEmbeddingProviders();

  const providers = useMemo(() => {
    if (!options?.allowedProviders) {return allProviders;}
    const lowerAllowed = options.allowedProviders.map((p) => p.toLowerCase());
    return allProviders.filter((p) =>
      lowerAllowed.includes(p.provider.toLowerCase())
    );
  }, [allProviders, options?.allowedProviders]);

  const queries = useQueries({
    queries: providers.map((provider) => ({
      queryKey: ["embedding-models", provider.provider],
      queryFn: async () => {
        const providerValue = provider.provider;
        const data = await trpc.models.embeddingByProvider.query({
          provider: providerValue
        });
        return {
          provider: providerValue,
          models: (data || []) as EmbeddingModel[]
        };
      },
      enabled: !providersLoading && providers.length > 0,
      staleTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false
    }))
  });

  const isLoading = providersLoading || queries.some((q) => q.isLoading);
  const isFetching = queries.some((q) => q.isFetching);
  const error = queries.find((q) => q.error)?.error;

  const allModels = queries
    .filter((q) => q.data)
    .flatMap((q) => q.data!.models);

  const refetch = useMemo(
    () => async () => {
      await Promise.all(queries.map((q) => q.refetch()));
    },
    [queries]
  );

  return {
    models: allModels || [],
    providers: providers.map((p) => p.provider),
    isLoading,
    isFetching,
    error,
    refetch
  };
};

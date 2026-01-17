import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";
import { UnifiedModel } from "../stores/ApiTypes";
import { llama_models as staticOllamaModels } from "../config/models";

/**
 * Hook to fetch recommended AI models from the backend.
 * 
 * Combines dynamic recommended models from the API with static local models
 * (like Ollama models) to provide a unified list of curated AI models.
 * The backend manages recommendations based on model quality and popularity.
 * 
 * @returns Object containing:
 *   - recommendedModels: Array of recommended models from the API
 *   - recommendedLoading: Loading state for the query
 *   - recommendedIsFetching: Fetching state (for background refreshes)
 *   - recommendedError: Error object if the query failed
 *   - combinedRecommendedModels: Merged array of API and static models
 * 
 * @example
 * ```typescript
 * const { combinedRecommendedModels, recommendedLoading } = useRecommendedModels();
 * 
 * if (recommendedLoading) {
 *   return <Loading />;
 * }
 * 
 * return (
 *   <ModelSelector models={combinedRecommendedModels} />
 * );
 * ```
 */
export const useRecommendedModels = () => {
  const {
    data: recommendedModels,
    isLoading: recommendedLoading,
    isFetching: recommendedIsFetching,
    error: recommendedError
  } = useQuery({
    queryKey: ["recommendedModels"],
    queryFn: async () => {
      const { data, error } = await client.GET("/api/models/recommended", {});
      if (error) {throw error;}
      return data;
    },
    refetchOnWindowFocus: false
  });

  const combinedRecommendedModels = useMemo<UnifiedModel[]>(() => {
    const staticModels = staticOllamaModels.map((m) => {
      return {
        ...m,
        repo_id: m.id
      };
    });
    const merged = [...(recommendedModels || []), ...staticModels];
    return merged;
  }, [recommendedModels]);

  return {
    recommendedModels,
    recommendedLoading,
    recommendedIsFetching,
    recommendedError,
    combinedRecommendedModels
  };
};

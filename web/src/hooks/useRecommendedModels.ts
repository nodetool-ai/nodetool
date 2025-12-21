import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";
import { UnifiedModel } from "../stores/ApiTypes";
import { llama_models as staticOllamaModels } from "../config/models";

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

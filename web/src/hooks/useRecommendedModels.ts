import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";
import { UnifiedModel } from "../stores/ApiTypes";
import { llama_models as staticOllamaModels } from "../config/models";

interface UseRecommendedModelsOptions {
  downloadedIds?: Set<string>;
}

export const useRecommendedModels = (options: UseRecommendedModelsOptions = {}) => {
  const { downloadedIds = new Set<string>() } = options;
  const {
    data: recommendedModels,
    isLoading: recommendedLoading,
    isFetching: recommendedIsFetching,
    error: recommendedError
  } = useQuery({
    queryKey: ["recommendedModels"],
    queryFn: async () => {
      const { data, error } = await client.GET(
        "/api/models/recommended_models",
        {}
      );
      if (error) throw error;
      return data.map(
        (model: any): UnifiedModel => ({
          id: model.repo_id,
          type: model.the_model_type || model.type,
          name: model.repo_id,
          repo_id: model.repo_id,
          path: model.path,
          description: "",
          readme: model.readme ?? "",
          size_on_disk: model.size_on_disk,
          downloaded: downloadedIds.has(model.repo_id)
        })
      );
    },
    refetchOnWindowFocus: false
  });

  const combinedRecommendedModels = useMemo<UnifiedModel[]>(() => {
    const merged = [...(recommendedModels || []), ...staticOllamaModels];
    return merged.filter((m) => !downloadedIds.has(m.id));
  }, [recommendedModels, downloadedIds]);

  return {
    recommendedModels,
    recommendedLoading,
    recommendedIsFetching,
    recommendedError,
    combinedRecommendedModels
  };
};
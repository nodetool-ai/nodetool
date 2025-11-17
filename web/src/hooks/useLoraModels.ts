import { useQuery } from "@tanstack/react-query";
import { tryCacheFiles } from "../serverState/tryCacheFiles";
import { HuggingFaceModel } from "../stores/ApiTypes";
import { useRecommendedModels } from "./useRecommendedModels";

interface UseLoraModelsParams {
  modelType: string;
  enabled?: boolean;
}

export const useLoraModels = ({ modelType, enabled = true }: UseLoraModelsParams) => {
  const { recommendedModels } = useRecommendedModels();

  return useQuery({
    enabled: enabled && modelType.startsWith("hf.lora_sd"),
    queryKey: ["lora-models", modelType],
    queryFn: async () => {
      // Collect LoRA entries from recommendations
      const loras = (recommendedModels || []).filter((m) => m.type === modelType);

      // Build a deduplicated list of valid repo_id/path pairs
      const pairs = Array.from(
        new Map(
          loras
            .filter((l) => !!l.repo_id && !!l.path)
            .map((l) => {
              const key = `${l.repo_id}:${l.path}`;
              return [key, { repo_id: l.repo_id!, path: l.path! }];
            })
        ).values()
      );

      if (pairs.length === 0) return [] as HuggingFaceModel[];

      const results = await tryCacheFiles(
        pairs.map((p) => ({ ...p, downloaded: false }))
      );

      return (
        results
          ?.filter((r) => r.downloaded)
          .map((r) => ({
            type: modelType,
            repo_id: r.repo_id,
            path: r.path
          })) || []
      ) as HuggingFaceModel[];
    }
  });
};

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
      const loras = recommendedModels?.filter(
        (model) => model.type === modelType
      );
      const loraPaths = loras?.map((lora) => ({
        repo_id: lora.repo_id || "",
        path: lora.path || "",
        downloaded: false
      }));
      const loraModels = await tryCacheFiles(loraPaths || []);
      return loraModels
        ?.filter((m) => m.downloaded)
        .map((lora) => ({
          type: modelType,
          repo_id: lora.repo_id,
          path: lora.path
        })) as HuggingFaceModel[];
    }
  });
}; 
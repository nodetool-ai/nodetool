import { useQuery } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";
import { LlamaModel, UnifiedModel } from "../stores/ApiTypes";

export const useOllamaModels = () => {
  const {
    data: ollamaModels,
    isLoading: ollamaLoading,
    isFetching: ollamaIsFetching,
    error: ollamaError
  } = useQuery({
    queryKey: ["ollamaModels"],
    queryFn: async () => {
      const { data, error } = await client.GET("/api/models/ollama_models", {});
      if (error) throw error;
      return data.map(
        (model: LlamaModel): UnifiedModel => ({
          id: model.name ?? "",
          repo_id: model.repo_id ?? "",
          type: "llama_model",
          name: `${model.details?.family} - ${model.details?.parameter_size}`,
          description: "",
          size_on_disk: model.size,
          downloaded: true
        })
      );
    },
    refetchOnWindowFocus: false
  });

  return {
    ollamaModels,
    ollamaLoading,
    ollamaIsFetching,
    ollamaError
  };
};
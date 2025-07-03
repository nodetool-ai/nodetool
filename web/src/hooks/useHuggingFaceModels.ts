import { useQuery } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";
import { UnifiedModel } from "../stores/ApiTypes";

export const useHuggingFaceModels = () => {
  const {
    data: hfModels,
    isLoading: hfLoading,
    isFetching: hfIsFetching,
    error: hfError
  } = useQuery({
    queryKey: ["huggingFaceModels"],
    queryFn: async () => {
      const { data, error } = await client.GET(
        "/api/models/huggingface_models",
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
          downloaded: true
        })
      );
    },
    refetchOnWindowFocus: false
  });

  return {
    hfModels,
    hfLoading,
    hfIsFetching,
    hfError
  };
};
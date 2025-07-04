import { useQuery } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";
import { CachedModel, UnifiedModel } from "../stores/ApiTypes";

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
      console.log("data", data);
      if (error) throw error;
      return data.map(
        (model: CachedModel): UnifiedModel => ({
          id: model.repo_id,
          type: model.the_model_type ?? "",
          name: model.repo_id,
          repo_id: model.repo_id,
          cache_path: model.path,
          has_model_index: model.has_model_index,
          description: "",
          readme: model.readme ?? "",
          size_on_disk: model.size_on_disk,
          downloaded: true,
          pipeline_tag: model.the_model_info?.pipeline_tag ?? ""
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
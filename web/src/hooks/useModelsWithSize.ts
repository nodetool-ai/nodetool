import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { UnifiedModel } from "../stores/ApiTypes";
import { client } from "../stores/ApiClient";
import { tryCacheFiles } from "../serverState/tryCacheFiles";

export function useModelsWithSize(recommendedModels: UnifiedModel[]) {
  const singleFileModels = recommendedModels.filter((model) => model.path);
  const filePaths = singleFileModels?.map((model) => ({
    repo_id: model.repo_id || "",
    path: model.path || ""
  }));

  const { data: hfModels } = useQuery({
    queryKey: ["huggingFaceModels"],
    queryFn: async () => {
      const { data, error } = await client.GET(
        "/api/models/huggingface_models",
        {}
      );
      if (error) throw error;
      return data;
    }
  });

  const { data: fileInfos } = useQuery({
    queryKey: ["fileInfos"].concat(
      filePaths?.map((path) => path.repo_id + ":" + path.path)
    ),
    queryFn: async () => {
      const { data, error } = await client.POST(
        "/api/models/huggingface/file_info",
        {
          body: filePaths
        }
      );
      if (error) throw error;
      return data;
    },
    enabled: filePaths && filePaths.length > 0
  });

  const { data: downloadedSingleFileModels } = useQuery({
    queryKey: ["downloadedSingleFileModels"].concat(
      singleFileModels?.map((path) => path.repo_id + ":" + path.path)
    ),
    queryFn: async () => await tryCacheFiles(filePaths || []),
    enabled: filePaths && filePaths.length > 0
  });

  return useMemo(() => {
    return recommendedModels.map((model) => {
      const singleFileModel = model.path
        ? downloadedSingleFileModels?.find(
            (m) => m.repo_id === model.repo_id && m.path === model.path
          )
        : null;
      const singleFileModelSize = fileInfos?.find(
        (m) => m.repo_id === model.repo_id && m.path === model.path
      )?.size;
      const hfModel = hfModels?.find((m) => m.repo_id === model.repo_id);

      return {
        ...model,
        size_on_disk: model.path ? singleFileModelSize : hfModel?.size_on_disk,
        downloaded: singleFileModel?.downloaded,
        readme: hfModel?.readme ?? ""
      };
    });
  }, [recommendedModels, downloadedSingleFileModels, fileInfos, hfModels]);
}

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { UnifiedModel } from "../stores/ApiTypes";
import { client } from "../stores/ApiClient";
import { tryCacheFiles } from "../serverState/tryCacheFiles";
import { createErrorMessage } from "../utils/errorHandling";
import { useHuggingFaceModels } from "./useHuggingFaceModels";

export function useModelsWithSize(models: UnifiedModel[]) {
  const singleFileModels = models.filter((model) => model.path);
  const { hfModels } = useHuggingFaceModels();
  
  const filePaths = singleFileModels?.map((model) => ({
    repo_id: model.repo_id || "",
    path: model.path || "",
    downloaded: false
  }));

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
      if (error) throw createErrorMessage(error, "Failed to load file info");
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
    return models.map((model) => {
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
        readme: hfModel?.readme ?? "",
        pipeline_tag: hfModel?.pipeline_tag || undefined,
        tags: hfModel?.tags
      };
    });
  }, [models, downloadedSingleFileModels, fileInfos, hfModels]);
}

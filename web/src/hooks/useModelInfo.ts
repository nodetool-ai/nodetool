import { useQuery } from "@tanstack/react-query";
import { UnifiedModel } from "../stores/ApiTypes";
import { fetchHuggingFaceRepoInfo } from "../utils/huggingFaceUtils";
import { formatBytes } from "../utils/modelFormatting";

function computeHuggingFaceDownloadSize(
  modelData: any,
  model: UnifiedModel
): number | undefined {
  if (!modelData || !modelData.siblings) {
    return undefined;
  }

  // If a specific path is provided, find that single file's size.
  if (model.path) {
    const targetFile = modelData.siblings.find(
      (file: any) => file.rfilename === model.path
    );
    return targetFile?.size;
  }

  // Otherwise, fall back to pattern matching for multi-file repos.
  const allowPatterns = model.allow_patterns;
  const ignorePatterns = model.ignore_patterns;

  if (!allowPatterns && !ignorePatterns) {
    return modelData.siblings
      .filter((file: any) => file.size)
      .reduce((total: number, file: any) => total + file.size, 0);
  }

  const downloadSize = modelData.siblings
    .filter((file: any) => {
      const rfilename = file.rfilename;
      if (!rfilename || !file.size) {
        return false;
      }

      if (
        ignorePatterns &&
        ignorePatterns.some((pattern) => rfilename.includes(pattern))
      ) {
        return false;
      }

      if (
        allowPatterns &&
        !allowPatterns.some((pattern) => rfilename.includes(pattern))
      ) {
        return false;
      }

      return true;
    })
    .reduce((total: number, file: any) => total + file.size, 0);

  return downloadSize;
}

export const useModelInfo = (model: UnifiedModel) => {
  const isHuggingFace = model.type?.startsWith("hf") ?? false;
  const modelIdForApi = model.repo_id || model.id;
  const isOllama = model.type === "llama_model";

  const {
    data: modelData,
    isLoading,
    isError
  } = useQuery({
    queryKey: ["huggingfaceRepoInfo", modelIdForApi],
    queryFn: () =>
      isHuggingFace ? fetchHuggingFaceRepoInfo(modelIdForApi) : null,
    enabled: isHuggingFace,
    staleTime: 1000 * 60 * 60 // 1 hour
  });

  const downloadSize =
    model.size_on_disk || computeHuggingFaceDownloadSize(modelData, model);
  const formattedSize = formatBytes(downloadSize);

  const getTag = (tagName: string) =>
    modelData?.tags?.includes(tagName) ? tagName : null;

  const getMetadataTag = (tagName: string) =>
    modelData?.cardData?.tags?.includes(tagName)
      ? tagName.split(":")[1] || tagName
      : null;

  const getModelFileType = () => {
    const ggufTag = getTag("gguf");
    if (ggufTag) return "GGUF";

    const safetensorsTag = getTag("safetensors");
    if (safetensorsTag) return "Safetensors";

    return null;
  };

  return {
    isHuggingFace,
    modelData,
    isLoading,
    isError,
    formattedSize,
    getTag,
    getMetadataTag,
    getModelFileType,
    isOllama
  };
};

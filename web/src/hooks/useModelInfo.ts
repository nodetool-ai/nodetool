import { useQuery } from "@tanstack/react-query";
import { UnifiedModel } from "../stores/ApiTypes";
import { fetchHuggingFaceRepoInfo } from "../utils/huggingFaceUtils";
import { formatBytes } from "../utils/modelFormatting";

function computeHuggingFaceDownloadSize(modelData: any): number | undefined {
  if (!modelData || !modelData.siblings) {
    return undefined;
  }

  const downloadSize = modelData.siblings
    .filter((file: any) => file.size)
    .reduce((total: number, file: any) => total + file.size, 0);

  return downloadSize;
}

export const useModelInfo = (model: UnifiedModel) => {
  const isHuggingFace = model.type?.startsWith("hf") ?? false;
  const modelId = model.id;
  const isOllama = model.type === "llama_model";

  const {
    data: modelData,
    isLoading,
    isError
  } = useQuery({
    queryKey: ["huggingfaceRepoInfo", modelId],
    queryFn: () => (isHuggingFace ? fetchHuggingFaceRepoInfo(modelId) : null),
    enabled: isHuggingFace,
    staleTime: 1000 * 60 * 60 // 1 hour
  });

  const downloadSize =
    model.size_on_disk || computeHuggingFaceDownloadSize(modelData);
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

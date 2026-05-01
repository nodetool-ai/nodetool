import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ModelPack, UnifiedModel } from "../stores/ApiTypes";
import useMetadataStore from "../stores/MetadataStore";
import { trpc } from "../lib/trpc";

type RecommendedTaskKey =
  | "recommendedImageTextToImage"
  | "recommendedImageImageToImage"
  | "recommendedVideoTextToVideo"
  | "recommendedVideoImageToVideo"
  | "recommendedLanguageEmbedding"
  | "recommendedAsr"
  | "recommendedTts"
  | null;

const mapNodeTypeToTask = (nodeType: string | undefined): RecommendedTaskKey => {
  switch (nodeType) {
    case "nodetool.image.TextToImage":
      return "recommendedImageTextToImage";
    case "nodetool.image.ImageToImage":
      return "recommendedImageImageToImage";
    case "nodetool.video.TextToVideo":
      return "recommendedVideoTextToVideo";
    case "nodetool.video.ImageToVideo":
      return "recommendedVideoImageToVideo";
    case "nodetool.text.AutomaticSpeechRecognition":
      return "recommendedAsr";
    case "nodetool.audio.TextToSpeech":
      return "recommendedTts";
    default:
      return null;
  }
};

async function fetchRecommendedByTask(
  task: RecommendedTaskKey
): Promise<UnifiedModel[]> {
  if (!task) return [];
  switch (task) {
    case "recommendedImageTextToImage":
      return trpc.models.recommendedImageTextToImage.query() as Promise<UnifiedModel[]>;
    case "recommendedImageImageToImage":
      return trpc.models.recommendedImageImageToImage.query() as Promise<UnifiedModel[]>;
    case "recommendedVideoTextToVideo":
      return trpc.models.recommendedVideoTextToVideo.query() as Promise<UnifiedModel[]>;
    case "recommendedVideoImageToVideo":
      return trpc.models.recommendedVideoImageToVideo.query() as Promise<UnifiedModel[]>;
    case "recommendedLanguageEmbedding":
      return trpc.models.recommendedLanguageEmbedding.query() as Promise<UnifiedModel[]>;
    case "recommendedAsr":
      return trpc.models.recommendedAsr.query() as Promise<UnifiedModel[]>;
    case "recommendedTts":
      return trpc.models.recommendedTts.query() as Promise<UnifiedModel[]>;
    default:
      return [];
  }
}

export interface RecommendedModelsForNode {
  recommendedModels: UnifiedModel[];
  modelPacks: ModelPack[];
}

/**
 * Returns recommended models and model packs for a given node type.
 * Used by the model picker dialog to surface downloadable models.
 */
export function useRecommendedModelsForNode(
  nodeType: string | undefined
): RecommendedModelsForNode {
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const taskKey = useMemo(() => mapNodeTypeToTask(nodeType), [nodeType]);

  const { data: apiModels = [] } = useQuery<UnifiedModel[]>({
    queryKey: ["recommended-task-models", taskKey],
    enabled: !!taskKey,
    queryFn: () => fetchRecommendedByTask(taskKey),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const recommendedModels = useMemo<UnifiedModel[]>(() => {
    if (taskKey) {
      return apiModels || [];
    }
    if (!nodeType) return [];
    const baseMetadata = getMetadata(nodeType);
    return baseMetadata?.recommended_models || [];
  }, [taskKey, apiModels, getMetadata, nodeType]);

  const modelPacks = useMemo<ModelPack[]>(() => {
    if (taskKey || !nodeType) return [];
    const baseMetadata = getMetadata(nodeType);
    return baseMetadata?.model_packs || [];
  }, [taskKey, getMetadata, nodeType]);

  return { recommendedModels, modelPacks };
}

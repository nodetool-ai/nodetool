import React, { memo, useMemo, useCallback } from "react";
import { UnifiedModel } from "../../stores/ApiTypes";
import useMetadataStore from "../../stores/MetadataStore";
import ModelRecommendationsButton from "./ModelRecommendationsButton";
import { BASE_URL } from "../../stores/BASE_URL";
import { useQuery } from "@tanstack/react-query";

interface ModelRecommendationsProps {
  nodeType: string;
}

type EndpointSuffix =
  | "image/text-to-image"
  | "image/image-to-image"
  | "video/text-to-video"
  | "video/image-to-video"
  | "language/embedding"
  | "asr"
  | "tts"
  | null;

const mapNodeTypeToEndpoint = (nodeType: string): EndpointSuffix => {
  switch (nodeType) {
    case "nodetool.image.TextToImage":
      return "image/text-to-image";
    case "nodetool.image.ImageToImage":
      return "image/image-to-image";
    case "nodetool.video.TextToVideo":
      return "video/text-to-video";
    case "nodetool.video.ImageToVideo":
      return "video/image-to-video";
    case "nodetool.text.AutomaticSpeechRecognition":
      return "asr";
    case "nodetool.audio.TextToSpeech":
      return "tts";
    default:
      return null;
  }
};

const ModelRecommendations: React.FC<ModelRecommendationsProps> = memo(({
  nodeType
}) => {
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const endpoint = useMemo(() => mapNodeTypeToEndpoint(nodeType), [nodeType]);

  const queryFn = useCallback(async () => {
    const res = await fetch(`${BASE_URL}/api/models/recommended/${endpoint}`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Failed to fetch recommended models for ${endpoint}: ${res.status} ${text}`
      );
    }
    return (await res.json()) as UnifiedModel[];
  }, [endpoint]);

  const { data: apiModels = [] } = useQuery<UnifiedModel[]>({
    queryKey: ["recommended-task-models", endpoint],
    enabled: !!endpoint,
    queryFn,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const recommendedModels: UnifiedModel[] = useMemo(() => {
    // If this node maps to a task-specific endpoint, rely solely on API recommendations
    if (endpoint) {
      return apiModels || [];
    }
    // For non-generic nodes, fall back to per-node metadata recommendations
    const baseMetadata = getMetadata(nodeType);
    return baseMetadata?.recommended_models || [];
  }, [endpoint, apiModels, getMetadata, nodeType]);

  const modelPacks = useMemo(() => {
    // We only show model packs for specific nodes, not generic endpoints currently
    if (endpoint) {return [];}

    const baseMetadata = getMetadata(nodeType);
    return baseMetadata?.model_packs || [];
  }, [endpoint, getMetadata, nodeType]);

  return <ModelRecommendationsButton recommendedModels={recommendedModels} modelPacks={modelPacks} />;
});

ModelRecommendations.displayName = "ModelRecommendations";

export default ModelRecommendations;

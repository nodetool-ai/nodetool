import React, { useMemo } from "react";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { ImageModel, UnifiedModel } from "../../stores/ApiTypes";
import { useHuggingFaceImageModelMenuStore } from "../../stores/ModelMenuStore";
import { useHuggingFaceImageModelsByProvider } from "../../hooks/useModelsByProvider";
import { BASE_URL } from "../../stores/BASE_URL";
import { useQuery } from "@tanstack/react-query";

export interface HuggingFaceModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  onModelChange?: (model: ImageModel) => void;
  task?: "text_to_image" | "image_to_image";
  modelType?: string;
}

type EndpointSuffix = "image/text-to-image" | "image/image-to-image" | null;

// Map task to endpoint for fetching recommended models
const mapTaskToEndpoint = (
  task?: "text_to_image" | "image_to_image"
): EndpointSuffix => {
  if (task === "text_to_image") {
    return "image/text-to-image";
  } else if (task === "image_to_image") {
    return "image/image-to-image";
  }
  return null;
};

export default function HuggingFaceModelMenuDialog({
  open,
  onClose,
  onModelChange,
  task,
  modelType
}: HuggingFaceModelMenuDialogProps) {
  const modelData = useHuggingFaceImageModelsByProvider({ task, modelType });

  // Map to endpoint for recommended models API
  const endpoint = useMemo(() => mapTaskToEndpoint(task), [task]);

  // Fetch recommended models from API
  const { data: recommendedModels = [] } = useQuery<UnifiedModel[]>({
    queryKey: ["recommended-task-models", endpoint],
    enabled: !!endpoint,
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/models/recommended/${endpoint}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `Failed to fetch recommended models for ${endpoint}: ${res.status} ${text}`
        );
      }
      return (await res.json()) as UnifiedModel[];
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  // Create a set of recommended model IDs for quick lookup
  const recommendedModelIds = useMemo(() => {
    return new Set(recommendedModels.map((m) => m.id));
  }, [recommendedModels]);

  // Sort models: recommended first, then alphabetically
  // Also deduplicate based on provider:id to avoid showing duplicates
  const sortedModelData = useMemo(() => {
    if (!modelData.models) {
      return modelData;
    }

    // Deduplicate first using provider:id as key
    const uniqueModelsMap = new Map<string, typeof modelData.models[0]>();
    modelData.models.forEach((model) => {
      const key = `${model.provider}:${model.id}`;
      if (!uniqueModelsMap.has(key)) {
        uniqueModelsMap.set(key, model);
      }
    });

    // Convert back to array and sort
    const sortedModels = Array.from(uniqueModelsMap.values()).sort((a, b) => {
      const aIsRecommended = recommendedModelIds.has(a.id || "");
      const bIsRecommended = recommendedModelIds.has(b.id || "");

      // Recommended models come first
      if (aIsRecommended && !bIsRecommended) return -1;
      if (!aIsRecommended && bIsRecommended) return 1;

      // Within same category, sort alphabetically by name
      return (a.name || "").localeCompare(b.name || "");
    });

    return {
      ...modelData,
      models: sortedModels
    };
  }, [modelData, recommendedModelIds]);

  return (
    <ModelMenuDialogBase<ImageModel>
      open={open}
      onClose={onClose}
      modelData={sortedModelData}
      onModelChange={onModelChange}
      title="Select HuggingFace Model"
      searchPlaceholder="Search HuggingFace models..."
      storeHook={useHuggingFaceImageModelMenuStore}
    />
  );
}

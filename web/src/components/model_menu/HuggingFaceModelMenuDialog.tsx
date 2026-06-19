import { useMemo, memo } from "react";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { ImageModel, ModelPack, UnifiedModel } from "../../stores/ApiTypes";
import { useHuggingFaceImageModelMenuStore } from "../../stores/ModelMenuStore";
import { useHuggingFaceImageModelsByProvider } from "../../hooks/useModelsByProvider";
import { useWorkerCachedModelIds } from "../../hooks/useWorkerCachedModels";
import { trpc } from "../../lib/trpc";
import { useQuery } from "@tanstack/react-query";

export interface HuggingFaceModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  onModelChange?: (model: ImageModel) => void;
  task?: "text_to_image" | "image_to_image";
  modelType?: string;
  anchorEl?: HTMLElement | null;
  recommendedModels?: UnifiedModel[];
  modelPacks?: ModelPack[];
}

type RecommendedTask = "text_to_image" | "image_to_image" | null;

// Map task to the tRPC procedure key for recommended models
const mapTaskToTrpcKey = (
  task?: "text_to_image" | "image_to_image"
): RecommendedTask => task ?? null;

function HuggingFaceModelMenuDialog({
  open,
  onClose,
  onModelChange,
  task,
  modelType,
  anchorEl,
  recommendedModels: recommendedModelsFromProps,
  modelPacks
}: HuggingFaceModelMenuDialogProps) {
  const modelData = useHuggingFaceImageModelsByProvider({ task, modelType });
  const workerCachedIds = useWorkerCachedModelIds();

  // Map to tRPC procedure key for recommended models
  const recommendedTask = useMemo(() => mapTaskToTrpcKey(task), [task]);

  // Fall back to fetching recommended models via tRPC when not provided by the caller
  const { data: recommendedModelsFallback = [] } = useQuery<UnifiedModel[]>({
    queryKey: ["recommended-task-models", recommendedTask],
    enabled: !recommendedModelsFromProps && !!recommendedTask,
    queryFn: async () => {
      if (recommendedTask === "text_to_image") {
        return trpc.models.recommendedImageTextToImage.query() as Promise<UnifiedModel[]>;
      } else if (recommendedTask === "image_to_image") {
        return trpc.models.recommendedImageImageToImage.query() as Promise<UnifiedModel[]>;
      }
      return [];
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });

  const recommendedModels = recommendedModelsFromProps ?? recommendedModelsFallback;

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

    // Convert back to array, sort, and merge worker downloaded state
    const sortedModels = Array.from(uniqueModelsMap.values())
      .sort((a, b) => {
        const aIsRecommended = recommendedModelIds.has(a.id || "");
        const bIsRecommended = recommendedModelIds.has(b.id || "");

        if (aIsRecommended && !bIsRecommended) { return -1; }
        if (!aIsRecommended && bIsRecommended) { return 1; }

        return (a.name || "").localeCompare(b.name || "");
      })
      .map((m) => {
        if (workerCachedIds.size === 0) return m;
        const key = m.path ? `${m.id}/${m.path}` : m.id;
        return workerCachedIds.has(key)
          ? ({ ...m, downloaded: true } as typeof m)
          : m;
      });

    return {
      ...modelData,
      models: sortedModels
    };
  }, [modelData, recommendedModelIds, workerCachedIds]);

  return (
    <ModelMenuDialogBase<ImageModel>
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      modelData={sortedModelData}
      onModelChange={onModelChange}
      title="Select HuggingFace Model"
      searchPlaceholder="Search HuggingFace models..."
      storeHook={useHuggingFaceImageModelMenuStore}
      recommendedModels={recommendedModels}
      modelPacks={modelPacks}
    />
  );
}

export default memo(HuggingFaceModelMenuDialog);



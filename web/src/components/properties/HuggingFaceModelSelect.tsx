import React, { useState, useCallback, useMemo, useRef } from "react";
import isEqual from "fast-deep-equal";
import HuggingFaceModelMenuDialog from "../model_menu/HuggingFaceModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { ImageModel, ModelPack, UnifiedModel, HuggingFaceModelValue, HuggingFaceModelValueInput } from "../../stores/ApiTypes";
import { useHuggingFaceImageModelsByProvider } from "../../hooks/useModelsByProvider";
import { trpc } from "../../lib/trpc";
import { useQuery } from "@tanstack/react-query";
import ModelSelectButton from "./shared/ModelSelectButton";

interface HuggingFaceModelSelectProps {
  modelType: string;
  onChange: (value: HuggingFaceModelValue) => void;
  value: HuggingFaceModelValueInput;
  recommendedModels?: UnifiedModel[];
  modelPacks?: ModelPack[];
}

type RecommendedTask = "text_to_image" | "image_to_image" | null;

// Map modelType to tRPC recommended task
const mapModelTypeToTask = (modelType: string): RecommendedTask => {
  if (modelType.startsWith("hf.text_to_image")) {
    return "text_to_image";
  } else if (modelType.startsWith("hf.image_to_image")) {
    return "image_to_image";
  }
  return null;
};

const HuggingFaceModelSelect: React.FC<HuggingFaceModelSelectProps> = ({
  modelType,
  onChange,
  value,
  recommendedModels: recommendedModelsFromProps,
  modelPacks
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);

  // Determine task from modelType
  const task = useMemo(() => {
    if (modelType.startsWith("hf.text_to_image")) {
      return "text_to_image" as const;
    } else if (modelType.startsWith("hf.image_to_image")) {
      return "image_to_image" as const;
    }
    return undefined;
  }, [modelType]);

  // Map to tRPC recommended task
  const recommendedTask = useMemo(
    () => mapModelTypeToTask(modelType),
    [modelType]
  );

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

  // Use the same hook as the dialog to fetch models
  const { models: fetchedModels } = useHuggingFaceImageModelsByProvider({
    task,
    modelType
  });

  // Sort models: recommended first, then alphabetically
  // Also deduplicate based on provider:id to avoid showing duplicates
  const sortedModels = useMemo(() => {
    if (!fetchedModels) { return fetchedModels; }

    // Deduplicate first using provider:id as key
    const uniqueModelsMap = new Map<string, (typeof fetchedModels)[0]>();
    fetchedModels.forEach((model) => {
      const key = `${model.provider}:${model.id}`;
      if (!uniqueModelsMap.has(key)) {
        uniqueModelsMap.set(key, model);
      }
    });

    // Convert back to array and sort
    return Array.from(uniqueModelsMap.values()).sort((a, b) => {
      const aIsRecommended = recommendedModelIds.has(a.id || "");
      const bIsRecommended = recommendedModelIds.has(b.id || "");

      // Recommended models come first
      if (aIsRecommended && !bIsRecommended) { return -1; }
      if (!aIsRecommended && bIsRecommended) { return 1; }

      // Within same category, sort alphabetically by name
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [fetchedModels, recommendedModelIds]);

  // Convert value format: value might be { repo_id, path, type } or { id, provider, name, path }
  // We need to find the matching model by repo_id/id and path
  const currentSelectedModelDetails = useMemo(() => {
    if (!sortedModels || !value) { return null; }

    // Handle both old format (repo_id) and new format (id)
    const searchId = value?.repo_id || value?.id;
    const searchPath = value?.path;
    if (!searchId) { return null; }

    return sortedModels.find((m) => {
      // ImageModel.id might be in format "repo_id:path" or just "repo_id"
      const modelId = m.id || "";
      const [modelRepoId, modelPathFromId] = modelId.split(":");

      // Check repo_id match
      if (modelRepoId === searchId) {
        // If value has a path, match it against both modelPathFromId and model.path
        if (searchPath) {
          const modelPath = modelPathFromId || m.path || "";
          return modelPath === searchPath;
        }
        // If no path in value, match models without path
        return !modelPathFromId && !m.path;
      }
      return false;
    });
  }, [sortedModels, value]);

  // Get display info: repo_id and path separately for two-line display
  const displayInfo = useMemo(() => {
    // First try to get from model details
    if (currentSelectedModelDetails) {
      const modelId = currentSelectedModelDetails.id || "";
      const [repoId, pathFromId] = modelId.split(":");
      const path = pathFromId || currentSelectedModelDetails.path;

      return {
        repoId: repoId || currentSelectedModelDetails.name || modelId,
        path: path || undefined
      };
    }

    // Fall back to value format
    if (value?.repo_id || value?.id) {
      return {
        repoId: value.repo_id || value.id || "",
        path: value?.path || undefined
      };
    }

    return {
      repoId: "Select HuggingFace Model",
      path: undefined
    };
  }, [currentSelectedModelDetails, value]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleDialogModelSelect = useCallback(
    (model: ImageModel) => {
      // Convert ImageModel to HuggingFace format
      // ImageModel.id might be "repo_id:path" or just "repo_id"
      // Also check model.path property directly
      const [repo_id, pathFromId] = (model.id || "").split(":");

      const modelToPass: HuggingFaceModelValue = {
        type: modelType,
        repo_id: repo_id || model.id || "",
        path: pathFromId || model.path || undefined
      };

      onChange(modelToPass);

      // Add to recent models
      addRecent({
        provider: model.provider || "huggingface",
        id: model.id || "",
        name: model.name || ""
      });

      setAnchorEl(null);
    },
    [onChange, addRecent, modelType]
  );

  return (
    <>
      <ModelSelectButton
        ref={buttonRef}
        active={!!(value?.repo_id || value?.id)}
        label={displayInfo.repoId}
        secondaryLabel={displayInfo.path}
        subLabel="Select HuggingFace Model"
        onClick={handleClick}
      />
      <HuggingFaceModelMenuDialog
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={handleClose}
        onModelChange={handleDialogModelSelect}
        task={task}
        modelType={modelType}
        recommendedModels={recommendedModels}
        modelPacks={modelPacks}
      />
    </>
  );
};

export default React.memo(HuggingFaceModelSelect, isEqual);

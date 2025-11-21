import React, { useState, useCallback, useMemo, useRef } from "react";
import { Typography, Tooltip, Button } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { isEqual } from "lodash";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import HuggingFaceModelMenuDialog from "../model_menu/HuggingFaceModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { ImageModel, UnifiedModel } from "../../stores/ApiTypes";
import { useHuggingFaceImageModelsByProvider } from "../../hooks/useModelsByProvider";
import { BASE_URL } from "../../stores/BASE_URL";
import { useQuery } from "@tanstack/react-query";

interface HuggingFaceModelSelectProps {
  modelType: string;
  onChange: (value: any) => void;
  value: any;
}

type EndpointSuffix = "image/text-to-image" | "image/image-to-image" | null;

// Map modelType to endpoint for fetching recommended models
const mapModelTypeToEndpoint = (modelType: string): EndpointSuffix => {
  if (modelType.startsWith("hf.text_to_image")) {
    return "image/text-to-image";
  } else if (modelType.startsWith("hf.image_to_image")) {
    return "image/image-to-image";
  }
  return null;
};

const HuggingFaceModelSelect: React.FC<HuggingFaceModelSelectProps> = ({
  modelType,
  onChange,
  value
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);
  const theme = useTheme();

  // Determine task from modelType
  const task = useMemo(() => {
    if (modelType.startsWith("hf.text_to_image")) {
      return "text_to_image" as const;
    } else if (modelType.startsWith("hf.image_to_image")) {
      return "image_to_image" as const;
    }
    return undefined;
  }, [modelType]);

  // Map to endpoint for recommended models API
  const endpoint = useMemo(
    () => mapModelTypeToEndpoint(modelType),
    [modelType]
  );

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

  // Use the same hook as the dialog to fetch models
  const { models: fetchedModels } = useHuggingFaceImageModelsByProvider({
    task,
    modelType
  });

  // Sort models: recommended first, then alphabetically
  // Also deduplicate based on provider:id to avoid showing duplicates
  const sortedModels = useMemo(() => {
    if (!fetchedModels) return fetchedModels;

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
      if (aIsRecommended && !bIsRecommended) return -1;
      if (!aIsRecommended && bIsRecommended) return 1;

      // Within same category, sort alphabetically by name
      return (a.name || "").localeCompare(b.name || "");
    });
  }, [fetchedModels, recommendedModelIds]);

  // Convert value format: value might be { repo_id, path, type } or { id, provider, name, path }
  // We need to find the matching model by repo_id/id and path
  const currentSelectedModelDetails = useMemo(() => {
    if (!sortedModels || !value) return null;

    // Handle both old format (repo_id) and new format (id)
    const searchId = value?.repo_id || value?.id;
    const searchPath = value?.path;
    if (!searchId) return null;

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

  const handleClick = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleDialogModelSelect = useCallback(
    (model: ImageModel) => {
      // Convert ImageModel to HuggingFace format
      // ImageModel.id might be "repo_id:path" or just "repo_id"
      // Also check model.path property directly
      const [repo_id, pathFromId] = (model.id || "").split(":");

      const modelToPass = {
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

      setDialogOpen(false);
    },
    [onChange, addRecent, modelType]
  );

  return (
    <>
      <Tooltip
        title={
          <div style={{ textAlign: "center" }}>
            <Typography variant="inherit">
              {displayInfo.repoId}
              {displayInfo.path && `:${displayInfo.path}`}
            </Typography>
            <Typography variant="caption" display="block">
              Select HuggingFace Model
            </Typography>
          </div>
        }
        enterDelay={TOOLTIP_ENTER_DELAY}
      >
        <Button
          ref={buttonRef}
          className={`select-model-button huggingface-model-button ${
            value ? "active" : ""
          }`}
          sx={{
            fontSize: "var(--fontSizeTiny)",
            border: "1px solid transparent",
            borderRadius: "0.25em",
            color: "var(--palette-grey-0)",
            textTransform: "none",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: 1,
            height: displayInfo.path ? "auto" : "18px",
            minHeight: 0,
            padding: "0 0.5em !important",
            maxWidth: "100%",
            overflow: "hidden",
            "&:hover": {
              backgroundColor: "var(--palette-grey-500)"
            }
          }}
          onClick={handleClick}
          size="small"
        >
          <div className="model-label" style={{ textAlign: "left", maxWidth: "100%", overflow: "hidden" }}>
            <div className="model-label-repo-id" style={{ lineHeight: 1, maxWidth: "100%", overflow: "hidden" }}>
              <Typography
                variant="body2"
                sx={{
                  color: "var(--palette-grey-200)",
                  lineHeight: 1,
                  display: "block",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis"
                }}
              >
                {displayInfo.repoId}
              </Typography>
            </div>
            {displayInfo.path && (
              <div className="model-label-path" style={{ lineHeight: 1, maxWidth: "100%", overflow: "hidden" }}>
                <Typography
                  variant="body2"
                  sx={{
                    color: "var(--palette-grey-400)",
                    lineHeight: 1,
                    display: "block",
                    fontSize: "0.75em",
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis"
                  }}
                >
                  {displayInfo.path}
                </Typography>
              </div>
            )}
          </div>
        </Button>
      </Tooltip>
      <HuggingFaceModelMenuDialog
        open={dialogOpen}
        onClose={handleClose}
        onModelChange={handleDialogModelSelect}
        task={task}
        modelType={modelType}
      />
    </>
  );
};

export default React.memo(HuggingFaceModelSelect, isEqual);

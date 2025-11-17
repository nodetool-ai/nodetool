import React, { useState, useCallback, useMemo, useRef } from "react";
import { Typography, Tooltip, Button } from "@mui/material";
import { useTheme } from "@mui/material/styles";
import { isEqual } from "lodash";
import { TOOLTIP_ENTER_DELAY } from "../../config/constants";
import HuggingFaceModelMenuDialog from "../model_menu/HuggingFaceModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { ImageModel } from "../../stores/ApiTypes";
import { useHuggingFaceImageModelsByProvider } from "../../hooks/useModelsByProvider";

interface HuggingFaceModelSelectProps {
  modelType: string;
  onChange: (value: any) => void;
  value: any;
}

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

  // Use the same hook as the dialog to fetch models
  const { models: fetchedModels } = useHuggingFaceImageModelsByProvider({ task });

  // Convert value format: value might be { repo_id, path, type } or { id, provider, name, path }
  // We need to find the matching model by repo_id/id and path
  const currentSelectedModelDetails = useMemo(() => {
    if (!fetchedModels || !value) return null;
    
    // Handle both old format (repo_id) and new format (id)
    const searchId = value?.repo_id || value?.id;
    const searchPath = value?.path;
    if (!searchId) return null;
    
    return fetchedModels.find((m) => {
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
  }, [fetchedModels, value]);

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
            "&:hover": {
              backgroundColor: "var(--palette-grey-500)"
            }
          }}
          onClick={handleClick}
          size="small"
        >
          <div className="model-label" style={{ textAlign: "left" }}>
            <div className="model-label-repo-id" style={{ lineHeight: 1 }}>
              <Typography
                variant="body2"
                sx={{
                  color: "var(--palette-grey-200)",
                  lineHeight: 1,
                  display: "block"
                }}
              >
                {displayInfo.repoId}
              </Typography>
            </div>
            {displayInfo.path && (
              <div className="model-label-path" style={{ lineHeight: 1 }}>
                <Typography
                  variant="body2"
                  sx={{
                    color: "var(--palette-grey-400)",
                    lineHeight: 1,
                    display: "block",
                    fontSize: "0.75em"
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
      />
    </>
  );
};

export default React.memo(HuggingFaceModelSelect, isEqual);

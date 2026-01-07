import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import isEqual from "lodash/isEqual";
import VideoModelMenuDialog from "../model_menu/VideoModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { VideoModel } from "../../stores/ApiTypes";
import { useVideoModelsByProvider } from "../../hooks/useModelsByProvider";
import ModelSelectButton from "./shared/ModelSelectButton";

interface VideoModelSelectProps {
  onChange: (value: any) => void;
  value: string;
  task?: "text_to_video" | "image_to_video";
}

const VideoModelSelect: React.FC<VideoModelSelectProps> = ({
  onChange,
  value,
  task
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);
  const getDefaultModel = useModelPreferencesStore((s) => s.getDefaultModel);

  const { models, isLoading } = useVideoModelsByProvider({ task });

  const currentSelectedModelDetails = useMemo(() => {
    if (!models || !value) {
      return null;
    }
    return models.find((m) => m.id === value);
  }, [models, value]);

  // Automatically fall back to default model if current model is not found
  useEffect(() => {
    // Only check once models are loaded and we have a value set
    if (isLoading || !models || models.length === 0) {
      return;
    }
    
    // If no value is set or model exists, don't do anything
    if (!value || currentSelectedModelDetails) {
      return;
    }

    // Model not found in the list, try to fall back to default
    const defaultModel = getDefaultModel("video_model");
    if (defaultModel) {
      // Check if the default model exists in the available models
      const defaultExists = models.some((m) => m.id === defaultModel.id);
      if (defaultExists) {
        const modelToPass = {
          type: "video_model" as const,
          id: defaultModel.id,
          provider: defaultModel.provider,
          name: defaultModel.name
        };
        onChange(modelToPass);
      }
    }
  }, [value, models, isLoading, currentSelectedModelDetails, getDefaultModel, onChange]);

  const handleClick = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleDialogModelSelect = useCallback(
    (model: VideoModel) => {
      const modelToPass = {
        type: "video_model" as const,
        id: model.id,
        provider: model.provider,
        name: model.name || ""
      };
      onChange(modelToPass);
      addRecent({
        provider: model.provider || "",
        id: model.id || "",
        name: model.name || ""
      });
      setDialogOpen(false);
    },
    [onChange, addRecent]
  );

  return (
    <>
      <ModelSelectButton
        ref={buttonRef}
        active={!!value}
        label={currentSelectedModelDetails?.name || value || "Select Model"}
        subLabel="Select Video Model"
        onClick={handleClick}
      />
      <VideoModelMenuDialog
        open={dialogOpen}
        onClose={handleClose}
        onModelChange={handleDialogModelSelect}
        task={task}
      />
    </>
  );
};

export default React.memo(VideoModelSelect, isEqual);

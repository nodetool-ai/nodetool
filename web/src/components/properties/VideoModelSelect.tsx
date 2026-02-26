import React, { useState, useCallback, useMemo, useRef } from "react";
import isEqual from "lodash/isEqual";
import VideoModelMenuDialog from "../model_menu/VideoModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { VideoModel } from "../../stores/ApiTypes";
import { client } from "../../stores/ApiClient";
import { useQuery } from "@tanstack/react-query";
import ModelSelectButton from "./shared/ModelSelectButton";

/**
 * Value type for video model selection
 */
interface VideoModelValue {
  type: "video_model";
  id: string;
  provider: string;
  name: string;
}

interface VideoModelSelectProps {
  onChange: (value: VideoModelValue) => void;
  value: string;
  task?: "text_to_video" | "image_to_video";
}

const VideoModelSelect: React.FC<VideoModelSelectProps> = ({
  onChange,
  value,
  task
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);

  const loadVideoModels = useCallback(async () => {
    const { data, error } = await client.GET(
      "/api/models/{model_type}" as any,
      {
        params: { path: { model_type: "video" } }
      }
    );
    if (error) {
      throw error;
    }
    return data as unknown as VideoModel[];
  }, []);

  const { data: models } = useQuery({
    queryKey: ["video-models"],
    queryFn: async () => await loadVideoModels()
  });

  const currentSelectedModelDetails = useMemo(() => {
    if (!models || !value) {
      return null;
    }
    return models.find((m) => m.id === value);
  }, [models, value]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
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
      setAnchorEl(null);
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
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={handleClose}
        onModelChange={handleDialogModelSelect}
        task={task}
      />
    </>
  );
};

export default React.memo(VideoModelSelect, isEqual);

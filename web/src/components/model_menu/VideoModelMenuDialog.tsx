import React from "react";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { VideoModel } from "../../stores/ApiTypes";
import {
  useVideoModelMenuStore
} from "../../stores/ModelMenuStore";
import { useVideoModelsByProvider } from "../../hooks/useModelsByProvider";

export interface VideoModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  onModelChange?: (model: VideoModel) => void;
  task?: "text_to_video" | "image_to_video";
}

export default function VideoModelMenuDialog({
  open,
  onClose,
  onModelChange,
  task
}: VideoModelMenuDialogProps) {
  const modelData = useVideoModelsByProvider({ task });
  return (
    <ModelMenuDialogBase<VideoModel>
      open={open}
      onClose={onClose}
      modelData={modelData}
      onModelChange={onModelChange}
      title="Select Video Model"
      searchPlaceholder="Search text-to-video models..."
      storeHook={useVideoModelMenuStore}
      modelType="video_model"
    />
  );
}

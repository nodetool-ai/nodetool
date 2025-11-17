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
  return (
    // @ts-expect-error - TypeScript has trouble inferring VideoModel from hook, but it's correct
    <ModelMenuDialogBase<VideoModel>
      open={open}
      onClose={onClose}
      useModelsHook={() => useVideoModelsByProvider({ task }) as any}
      onModelChange={onModelChange}
      title="Select Video Model"
      searchPlaceholder="Search text-to-video models..."
      storeHook={useVideoModelMenuStore}
    />
  );
}

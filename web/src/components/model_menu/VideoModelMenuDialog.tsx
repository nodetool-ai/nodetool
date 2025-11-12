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
}

export default function VideoModelMenuDialog({
  open,
  onClose,
  onModelChange
}: VideoModelMenuDialogProps) {
  return (
    // @ts-expect-error - TypeScript has trouble inferring VideoModel from hook, but it's correct
    <ModelMenuDialogBase<VideoModel>
      open={open}
      onClose={onClose}
      useModelsHook={useVideoModelsByProvider as any}
      onModelChange={onModelChange}
      title="Select Video Model"
      searchPlaceholder="Search text-to-video models..."
      storeHook={useVideoModelMenuStore}
    />
  );
}

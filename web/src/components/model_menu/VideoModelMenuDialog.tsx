import React from "react";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { VideoModel } from "../../stores/ApiTypes";
import {
  useVideoModelMenuStore,
  VIDEO_PROVIDERS,
  type ModelSelectorModel
} from "../../stores/ModelMenuStore";

export interface VideoModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  models?: VideoModel[];
  isLoading?: boolean;
  isError?: boolean;
  onModelChange?: (model: VideoModel) => void;
}

export default function VideoModelMenuDialog({
  open,
  onClose,
  models,
  isLoading,
  isError,
  onModelChange
}: VideoModelMenuDialogProps) {
  // Type assertion to help TypeScript recognize VideoModel as part of ModelSelectorModel union
  const DialogComponent = ModelMenuDialogBase as React.ComponentType<{
    open: boolean;
    onClose: () => void;
    models?: VideoModel[];
    isLoading?: boolean;
    isError?: boolean;
    onModelChange?: (model: VideoModel) => void;
    title: string;
    searchPlaceholder: string;
    storeHook: typeof useVideoModelMenuStore;
    filterProviders?: string[];
  }>;

  return (
    <DialogComponent
      open={open}
      onClose={onClose}
      models={models}
      isLoading={isLoading}
      isError={isError}
      onModelChange={onModelChange}
      title="Select Video Model"
      searchPlaceholder="Search text-to-video models..."
      storeHook={useVideoModelMenuStore}
      filterProviders={VIDEO_PROVIDERS}
    />
  );
}

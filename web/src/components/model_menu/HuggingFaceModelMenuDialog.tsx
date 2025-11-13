import React from "react";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { ImageModel } from "../../stores/ApiTypes";
import { useHuggingFaceImageModelMenuStore } from "../../stores/ModelMenuStore";
import { useHuggingFaceImageModelsByProvider } from "../../hooks/useModelsByProvider";

export interface HuggingFaceModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  onModelChange?: (model: ImageModel) => void;
  task?: "text_to_image" | "image_to_image";
}

export default function HuggingFaceModelMenuDialog({
  open,
  onClose,
  onModelChange,
  task
}: HuggingFaceModelMenuDialogProps) {
  return (
    <ModelMenuDialogBase<ImageModel>
      open={open}
      onClose={onClose}
      useModelsHook={() => useHuggingFaceImageModelsByProvider({ task })}
      onModelChange={onModelChange}
      title="Select HuggingFace Model"
      searchPlaceholder="Search HuggingFace models..."
      storeHook={useHuggingFaceImageModelMenuStore}
    />
  );
}


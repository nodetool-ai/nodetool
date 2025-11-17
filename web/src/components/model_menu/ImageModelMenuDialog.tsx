import React from "react";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { ImageModel } from "../../stores/ApiTypes";
import { useImageModelMenuStore } from "../../stores/ModelMenuStore";
import { useImageModelsByProvider } from "../../hooks/useModelsByProvider";

export interface ImageModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  onModelChange?: (model: ImageModel) => void;
  task?: "text_to_image" | "image_to_image";
}

export default function ImageModelMenuDialog({
  open,
  onClose,
  onModelChange,
  task
}: ImageModelMenuDialogProps) {
  return (
    <ModelMenuDialogBase<ImageModel>
      open={open}
      onClose={onClose}
      useModelsHook={() => useImageModelsByProvider({ task })}
      onModelChange={onModelChange}
      title="Select Image Model"
      searchPlaceholder="Search image models..."
      storeHook={useImageModelMenuStore}
    />
  );
}

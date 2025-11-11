import React from "react";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { ImageModel } from "../../stores/ApiTypes";
import {
  useImageModelMenuStore
} from "../../stores/ModelMenuStore";
import { useImageModelsByProvider } from "../../hooks/useModelsByProvider";

export interface ImageModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  onModelChange?: (model: ImageModel) => void;
}

export default function ImageModelMenuDialog({
  open,
  onClose,
  onModelChange
}: ImageModelMenuDialogProps) {
  return (
    <ModelMenuDialogBase<ImageModel>
      open={open}
      onClose={onClose}
      useModelsHook={useImageModelsByProvider}
      onModelChange={onModelChange}
      title="Select Image Model"
      searchPlaceholder="Search image models..."
      storeHook={useImageModelMenuStore}
    />
  );
}

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
  anchorEl?: HTMLElement | null;
}

export default function ImageModelMenuDialog({
  open,
  onClose,
  onModelChange,
  task,
  anchorEl
}: ImageModelMenuDialogProps) {
  const modelData = useImageModelsByProvider({ task });
  return (
    <ModelMenuDialogBase<ImageModel>
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      modelData={modelData}
      onModelChange={onModelChange}
      title="Select Image Model"
      searchPlaceholder="Search image models..."
      storeHook={useImageModelMenuStore}
    />
  );
}

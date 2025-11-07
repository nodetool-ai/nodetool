import React from "react";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { ImageModel } from "../../stores/ApiTypes";
import {
  useImageModelMenuStore
} from "../../stores/ModelMenuStore";

export interface ImageModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  models?: ImageModel[];
  isLoading?: boolean;
  isError?: boolean;
  onModelChange?: (model: ImageModel) => void;
}

export default function ImageModelMenuDialog({
  open,
  onClose,
  models,
  isLoading,
  isError,
  onModelChange
}: ImageModelMenuDialogProps) {
  return (
    <ModelMenuDialogBase<ImageModel>
      open={open}
      onClose={onClose}
      models={models}
      isLoading={isLoading}
      isError={isError}
      onModelChange={onModelChange}
      title="Select Image Model"
      searchPlaceholder="Search image models..."
      storeHook={useImageModelMenuStore}
    />
  );
}

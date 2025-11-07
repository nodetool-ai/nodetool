import React from "react";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { ASRModel } from "../../stores/ApiTypes";
import {
  useASRModelMenuStore,
  type ModelSelectorModel
} from "../../stores/ModelMenuStore";

export interface ASRModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  models?: ASRModel[];
  isLoading?: boolean;
  isError?: boolean;
  onModelChange?: (model: ASRModel) => void;
}

export default function ASRModelMenuDialog({
  open,
  onClose,
  models,
  isLoading,
  isError,
  onModelChange
}: ASRModelMenuDialogProps) {
  // Type assertion to help TypeScript recognize ASRModel as part of ModelSelectorModel union
  const DialogComponent = ModelMenuDialogBase as React.ComponentType<{
    open: boolean;
    onClose: () => void;
    models?: ASRModel[];
    isLoading?: boolean;
    isError?: boolean;
    onModelChange?: (model: ASRModel) => void;
    title: string;
    searchPlaceholder: string;
    storeHook: typeof useASRModelMenuStore;
  }>;

  return (
    <DialogComponent
      open={open}
      onClose={onClose}
      models={models}
      isLoading={isLoading}
      isError={isError}
      onModelChange={onModelChange}
      title="Select ASR Model"
      searchPlaceholder="Search speech-to-text models..."
      storeHook={useASRModelMenuStore}
    />
  );
}

import React from "react";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { TTSModel } from "../../stores/ApiTypes";
import {
  useTTSModelMenuStore,
  TTS_PROVIDERS,
  type ModelSelectorModel
} from "../../stores/ModelMenuStore";

export interface TTSModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  models?: TTSModel[];
  isLoading?: boolean;
  isError?: boolean;
  onModelChange?: (model: TTSModel) => void;
}

export default function TTSModelMenuDialog({
  open,
  onClose,
  models,
  isLoading,
  isError,
  onModelChange
}: TTSModelMenuDialogProps) {
  // Type assertion to help TypeScript recognize TTSModel as part of ModelSelectorModel union
  const DialogComponent = ModelMenuDialogBase as React.ComponentType<{
    open: boolean;
    onClose: () => void;
    models?: TTSModel[];
    isLoading?: boolean;
    isError?: boolean;
    onModelChange?: (model: TTSModel) => void;
    title: string;
    searchPlaceholder: string;
    storeHook: typeof useTTSModelMenuStore;
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
      title="Select TTS Model"
      searchPlaceholder="Search text-to-speech models..."
      storeHook={useTTSModelMenuStore}
      filterProviders={TTS_PROVIDERS}
    />
  );
}

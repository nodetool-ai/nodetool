import React from "react";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { LanguageModel } from "../../stores/ApiTypes";
import { useLanguageModelMenuStore } from "../../stores/ModelMenuStore";

export interface LanguageModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  models?: LanguageModel[];
  isLoading?: boolean;
  isError?: boolean;
  onModelChange?: (model: LanguageModel) => void;
}

export default function LanguageModelMenuDialog({
  open,
  onClose,
  models,
  isLoading,
  isError,
  onModelChange
}: LanguageModelMenuDialogProps) {
  return (
    <ModelMenuDialogBase<LanguageModel>
      open={open}
      onClose={onClose}
      models={models}
      isLoading={isLoading}
      isError={isError}
      onModelChange={onModelChange}
      title="Select Language Model"
      searchPlaceholder="Search language models..."
      storeHook={useLanguageModelMenuStore}
    />
  );
}





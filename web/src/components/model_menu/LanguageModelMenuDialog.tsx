import React from "react";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { LanguageModel } from "../../stores/ApiTypes";
import { useLanguageModelMenuStore } from "../../stores/ModelMenuStore";
import { useLanguageModelsByProvider } from "../../hooks/useModelsByProvider";

export interface LanguageModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  onModelChange?: (model: LanguageModel) => void;
  allowedProviders?: string[];
}

export default function LanguageModelMenuDialog({
  open,
  onClose,
  onModelChange,
  allowedProviders
}: LanguageModelMenuDialogProps) {
  const modelData = useLanguageModelsByProvider({ allowedProviders });
  return (
    <ModelMenuDialogBase<LanguageModel>
      open={open}
      onClose={onClose}
      modelData={modelData}
      onModelChange={onModelChange}
      title="Select Language Model"
      searchPlaceholder="Search language models..."
      storeHook={useLanguageModelMenuStore}
    />
  );
}


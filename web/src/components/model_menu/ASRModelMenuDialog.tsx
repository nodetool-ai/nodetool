import React from "react";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { ASRModel } from "../../stores/ApiTypes";
import {
  useASRModelMenuStore
} from "../../stores/ModelMenuStore";
import { useASRModelsByProvider } from "../../hooks/useModelsByProvider";

export interface ASRModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  onModelChange?: (model: ASRModel) => void;
}

export default function ASRModelMenuDialog({
  open,
  onClose,
  onModelChange
}: ASRModelMenuDialogProps) {
  return (
    <ModelMenuDialogBase<ASRModel>
      open={open}
      onClose={onClose}
      // @ts-expect-error - generic inference between hooks differs
      useModelsHook={useASRModelsByProvider as any}
      onModelChange={onModelChange}
      title="Select ASR Model"
      searchPlaceholder="Search speech-to-text models..."
      storeHook={useASRModelMenuStore}
    />
  );
}

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
  anchorEl?: HTMLElement | null;
}

export default function ASRModelMenuDialog({
  open,
  onClose,
  onModelChange,
  anchorEl
}: ASRModelMenuDialogProps) {
  const modelData = useASRModelsByProvider();
  return (
    <ModelMenuDialogBase<ASRModel>
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      modelData={modelData}
      onModelChange={onModelChange}
      title="Select ASR Model"
      searchPlaceholder="Search speech-to-text models..."
      storeHook={useASRModelMenuStore}
    />
  );
}

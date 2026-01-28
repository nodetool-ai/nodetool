import React from "react";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { TTSModel } from "../../stores/ApiTypes";
import {
  useTTSModelMenuStore
} from "../../stores/ModelMenuStore";
import { useTTSModelsByProvider } from "../../hooks/useModelsByProvider";

export interface TTSModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  onModelChange?: (model: TTSModel) => void;
  anchorEl?: HTMLElement | null;
}

export default function TTSModelMenuDialog({
  open,
  onClose,
  onModelChange,
  anchorEl
}: TTSModelMenuDialogProps) {
  const modelData = useTTSModelsByProvider();
  return (
    <ModelMenuDialogBase<TTSModel>
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      modelData={modelData}
      onModelChange={onModelChange}
      title="Select TTS Model"
      searchPlaceholder="Search text-to-speech models..."
      storeHook={useTTSModelMenuStore}
    />
  );
}

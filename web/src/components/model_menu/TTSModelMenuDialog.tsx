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
}

export default function TTSModelMenuDialog({
  open,
  onClose,
  onModelChange
}: TTSModelMenuDialogProps) {
  return (
    // @ts-expect-error - TypeScript has trouble inferring TTSModel from hook, but it's correct
    <ModelMenuDialogBase<TTSModel>
      open={open}
      onClose={onClose}
      useModelsHook={useTTSModelsByProvider as any}
      onModelChange={onModelChange}
      title="Select TTS Model"
      searchPlaceholder="Search text-to-speech models..."
      storeHook={useTTSModelMenuStore}
    />
  );
}

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
    <ModelMenuDialogBase<TTSModel>
      open={open}
      onClose={onClose}
      // @ts-expect-error - generic inference between hooks differs
      useModelsHook={useTTSModelsByProvider as any}
      onModelChange={onModelChange}
      title="Select TTS Model"
      searchPlaceholder="Search text-to-speech models..."
      storeHook={useTTSModelMenuStore}
    />
  );
}

import React, { memo } from "react";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { EmbeddingModel } from "../../stores/ApiTypes";
import { useEmbeddingModelsByProvider } from "../../hooks/useEmbeddingModels";
import { useEmbeddingModelMenuStore } from "../../stores/ModelMenuStore";

export interface EmbeddingModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  onModelChange?: (model: EmbeddingModel) => void;
  allowedProviders?: string[];
  anchorEl?: HTMLElement | null;
}

function EmbeddingModelMenuDialog({
  open,
  onClose,
  onModelChange,
  allowedProviders,
  anchorEl
}: EmbeddingModelMenuDialogProps) {
  const modelData = useEmbeddingModelsByProvider({ allowedProviders });
  return (
    <ModelMenuDialogBase<EmbeddingModel>
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      modelData={modelData}
      onModelChange={onModelChange}
      title="Select Embedding Model"
      searchPlaceholder="Search embedding models..."
      storeHook={useEmbeddingModelMenuStore as any}
    />
  );
}

export default memo(EmbeddingModelMenuDialog);

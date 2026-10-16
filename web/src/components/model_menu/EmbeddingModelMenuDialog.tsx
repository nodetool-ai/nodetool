import { memo } from "react";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { EmbeddingModel, ModelPack, UnifiedModel } from "../../stores/ApiTypes";
import { useEmbeddingModelsByProvider } from "../../hooks/useEmbeddingModels";
import { useEmbeddingModelMenuStore } from "../../stores/ModelMenuStore";

/** The provider capability this picker serves, for local providers to install. */
const LOCAL_CAPABILITIES = ["generate_embedding"];

interface EmbeddingModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  onModelChange?: (model: EmbeddingModel) => void;
  allowedProviders?: string[];
  anchorEl?: HTMLElement | null;
  recommendedModels?: UnifiedModel[];
  modelPacks?: ModelPack[];
}

function EmbeddingModelMenuDialog({
  open,
  onClose,
  onModelChange,
  allowedProviders,
  anchorEl,
  recommendedModels,
  modelPacks
}: EmbeddingModelMenuDialogProps) {
  const modelData = useEmbeddingModelsByProvider({ allowedProviders });
  return (
    <ModelMenuDialogBase<EmbeddingModel>
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      modelData={modelData}
      onModelChange={onModelChange}
      title="Select embedding model"
      searchPlaceholder="Search embedding models…"
      storeHook={useEmbeddingModelMenuStore}
      modelType="embedding_model"
      localCapabilities={LOCAL_CAPABILITIES}
      recommendedModels={recommendedModels}
      modelPacks={modelPacks}
    />
  );
}

export default memo(EmbeddingModelMenuDialog);

import React from "react";
import isEqual from "../../utils/isEqual";
import EmbeddingModelMenuDialog from "../model_menu/EmbeddingModelMenuDialog";
import type { ModelPack, UnifiedModel } from "../../stores/ApiTypes";
import { useEmbeddingModelsByProvider } from "../../hooks/useEmbeddingModels";
import ModelSelectButton from "./shared/ModelSelectButton";
import useModelSelectMenu from "./shared/useModelSelectMenu";

interface EmbeddingModelSelection {
  type: "embedding_model";
  id: string;
  name: string;
  provider: string;
}

interface EmbeddingModelSelectProps {
  onChange: (value: EmbeddingModelSelection) => void;
  value: string;
  allowedProviders?: string[];
  recommendedModels?: UnifiedModel[];
  modelPacks?: ModelPack[];
}

const EmbeddingModelSelect: React.FC<EmbeddingModelSelectProps> = ({
  onChange,
  value,
  allowedProviders,
  recommendedModels,
  modelPacks
}) => {
  const { anchorEl, buttonRef, handleClick, handleClose, handleSelect } =
    useModelSelectMenu("embedding_model", onChange);

  const { models: fetchedModels } = useEmbeddingModelsByProvider({
    allowedProviders
  });

  const currentSelectedModelDetails = React.useMemo(() => {
    if (!fetchedModels || !value) { return null; }
    return fetchedModels.find((m) => m.id === value);
  }, [fetchedModels, value]);

  return (
    <>
      <ModelSelectButton
        ref={buttonRef}
        active={!!value}
        label={currentSelectedModelDetails?.name || value || "Select Model"}
        secondaryLabel={currentSelectedModelDetails?.provider}
        subLabel="Select Embedding Model"
        onClick={handleClick}
      />
      <EmbeddingModelMenuDialog
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={handleClose}
        onModelChange={handleSelect}
        allowedProviders={allowedProviders}
        recommendedModels={recommendedModels}
        modelPacks={modelPacks}
      />
    </>
  );
};

export default React.memo(EmbeddingModelSelect, isEqual);

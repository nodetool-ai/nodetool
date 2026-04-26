import React, { useState, useCallback, useRef } from "react";
import isEqual from "fast-deep-equal";
import EmbeddingModelMenuDialog from "../model_menu/EmbeddingModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { EmbeddingModel, ModelPack, UnifiedModel } from "../../stores/ApiTypes";
import { useEmbeddingModelsByProvider } from "../../hooks/useEmbeddingModels";
import ModelSelectButton from "./shared/ModelSelectButton";

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
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);

  const { models: fetchedModels } = useEmbeddingModelsByProvider({
    allowedProviders
  });

  const currentSelectedModelDetails = React.useMemo(() => {
    if (!fetchedModels || !value) { return null; }
    return fetchedModels.find((m) => m.id === value);
  }, [fetchedModels, value]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleDialogModelSelect = useCallback(
    (model: EmbeddingModel) => {
      onChange({
        type: "embedding_model",
        id: model.id,
        name: model.name,
        provider: model.provider
      });
      addRecent({
        provider: model.provider || "",
        id: model.id || "",
        name: model.name || ""
      });
      setAnchorEl(null);
    },
    [onChange, addRecent]
  );

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
        onModelChange={handleDialogModelSelect}
        allowedProviders={allowedProviders}
        recommendedModels={recommendedModels}
        modelPacks={modelPacks}
      />
    </>
  );
};

export default React.memo(EmbeddingModelSelect, isEqual);

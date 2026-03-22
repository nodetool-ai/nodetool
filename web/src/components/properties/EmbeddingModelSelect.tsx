import React, { useState, useCallback, useRef } from "react";
import isEqual from "lodash/isEqual";
import EmbeddingModelMenuDialog from "../model_menu/EmbeddingModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { EmbeddingModel } from "../../stores/ApiTypes";
import { useEmbeddingModelsByProvider } from "../../hooks/useEmbeddingModels";
import ModelSelectButton from "./shared/ModelSelectButton";

interface EmbeddingModelSelectProps {
  onChange: (value: any) => void;
  value: string;
  allowedProviders?: string[];
}

const EmbeddingModelSelect: React.FC<EmbeddingModelSelectProps> = ({
  onChange,
  value,
  allowedProviders
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
      />
    </>
  );
};

export default React.memo(EmbeddingModelSelect, isEqual);

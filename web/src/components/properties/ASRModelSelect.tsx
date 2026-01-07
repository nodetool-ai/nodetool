import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import isEqual from "lodash/isEqual";
import ASRModelMenuDialog from "../model_menu/ASRModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { ASRModel } from "../../stores/ApiTypes";
import ModelSelectButton from "./shared/ModelSelectButton";
import { useASRModelsByProvider } from "../../hooks/useModelsByProvider";

interface ASRModelSelectProps {
  onChange: (value: any) => void;
  value: string;
}

const ASRModelSelect: React.FC<ASRModelSelectProps> = ({ onChange, value }) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);
  const getDefaultModel = useModelPreferencesStore((s) => s.getDefaultModel);

  const { models, isLoading } = useASRModelsByProvider();

  const currentSelectedModelDetails = useMemo(() => {
    if (!models || !value) {
      return null;
    }
    return models.find((m) => m.id === value);
  }, [models, value]);

  // Automatically fall back to default model if current model is not found
  useEffect(() => {
    // Only check once models are loaded and we have a value set
    if (isLoading || !models || models.length === 0) {
      return;
    }
    
    // If no value is set or model exists, don't do anything
    if (!value || currentSelectedModelDetails) {
      return;
    }

    // Model not found in the list, try to fall back to default
    const defaultModel = getDefaultModel("asr_model");
    if (defaultModel) {
      // Check if the default model exists in the available models
      const defaultExists = models.some((m) => m.id === defaultModel.id);
      if (defaultExists) {
        const modelToPass = {
          type: "asr_model" as const,
          id: defaultModel.id,
          provider: defaultModel.provider,
          name: defaultModel.name
        };
        onChange(modelToPass);
      }
    }
  }, [value, models, isLoading, currentSelectedModelDetails, getDefaultModel, onChange]);

  const handleClick = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleDialogModelSelect = useCallback(
    (model: ASRModel) => {
      const modelToPass = {
        type: "asr_model" as const,
        id: model.id,
        provider: model.provider,
        name: model.name || ""
      };
      onChange(modelToPass);
      addRecent({
        provider: model.provider || "",
        id: model.id || "",
        name: model.name || ""
      });
      setDialogOpen(false);
    },
    [onChange, addRecent]
  );

  return (
    <>
      <ModelSelectButton
        ref={buttonRef}
        active={!!value}
        label={currentSelectedModelDetails?.name || value || "Select Model"}
        subLabel="Select ASR Model"
        onClick={handleClick}
      />
      <ASRModelMenuDialog
        open={dialogOpen}
        onClose={handleClose}
        onModelChange={handleDialogModelSelect}
      />
    </>
  );
};

export default React.memo(ASRModelSelect, isEqual);

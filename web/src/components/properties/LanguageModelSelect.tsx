import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import isEqual from "lodash/isEqual";
import LanguageModelMenuDialog from "../model_menu/LanguageModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { LanguageModel } from "../../stores/ApiTypes";
import { useLanguageModelsByProvider } from "../../hooks/useModelsByProvider";
import ModelSelectButton from "./shared/ModelSelectButton";

interface LanguageModelSelectProps {
  onChange: (value: any) => void;
  value: string;
  allowedProviders?: string[];
}

const LanguageModelSelect: React.FC<LanguageModelSelectProps> = ({
  onChange,
  value,
  allowedProviders
}) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);
  const getDefaultModel = useModelPreferencesStore((s) => s.getDefaultModel);

  // Use the same hook as the dialog to fetch models
  const { models: fetchedModels, isLoading } = useLanguageModelsByProvider({
    allowedProviders
  });

  const currentSelectedModelDetails = useMemo(() => {
    if (!fetchedModels || !value) { return null; }
    return fetchedModels.find((m) => m.id === value);
  }, [fetchedModels, value]);

  // Automatically fall back to default model if current model is not found
  useEffect(() => {
    // Only check once models are loaded and we have a value set
    if (isLoading || !fetchedModels || fetchedModels.length === 0) {
      return;
    }
    
    // If no value is set or model exists, don't do anything
    if (!value || currentSelectedModelDetails) {
      return;
    }

    // Model not found in the list, try to fall back to default
    const defaultModel = getDefaultModel("language_model");
    if (defaultModel) {
      // Check if the default model exists in the available models
      const defaultExists = fetchedModels.some((m) => m.id === defaultModel.id);
      if (defaultExists) {
        const modelToPass = {
          type: "language_model" as const,
          id: defaultModel.id,
          provider: defaultModel.provider,
          name: defaultModel.name
        };
        onChange(modelToPass);
      }
    }
  }, [value, fetchedModels, isLoading, currentSelectedModelDetails, getDefaultModel, onChange]);

  const handleClick = useCallback(() => {
    setDialogOpen(true);
  }, []);

  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, []);

  const handleDialogModelSelect = useCallback(
    (model: LanguageModel) => {
      const modelToPass = {
        type: "language_model" as const,
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
        secondaryLabel={currentSelectedModelDetails?.provider ? `Provider: ${currentSelectedModelDetails.provider}` : undefined}
        subLabel="Select Model"
        onClick={handleClick}
      />
      <LanguageModelMenuDialog
        open={dialogOpen}
        onClose={handleClose}
        onModelChange={handleDialogModelSelect}
        allowedProviders={allowedProviders}
      />
    </>
  );
};

export default React.memo(LanguageModelSelect, isEqual);

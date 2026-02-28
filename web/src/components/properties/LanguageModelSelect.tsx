import React, { useState, useCallback, useMemo, useRef } from "react";
import isEqual from "lodash/isEqual";
import LanguageModelMenuDialog from "../model_menu/LanguageModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type { LanguageModel, LanguageModelValue } from "../../stores/ApiTypes";
import { useLanguageModelsByProvider } from "../../hooks/useModelsByProvider";
import ModelSelectButton from "./shared/ModelSelectButton";

interface LanguageModelSelectProps {
  onChange: (value: LanguageModelValue) => void;
  value: string;
  allowedProviders?: string[];
}

const LanguageModelSelect: React.FC<LanguageModelSelectProps> = ({
  onChange,
  value,
  allowedProviders
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);

  // Use the same hook as the dialog to fetch models
  const { models: fetchedModels } = useLanguageModelsByProvider({
    allowedProviders
  });

  const currentSelectedModelDetails = useMemo(() => {
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
        subLabel="Select Model"
        onClick={handleClick}
      />
      <LanguageModelMenuDialog
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={handleClose}
        onModelChange={handleDialogModelSelect}
        allowedProviders={allowedProviders}
      />
    </>
  );
};

export default React.memo(LanguageModelSelect, isEqual);

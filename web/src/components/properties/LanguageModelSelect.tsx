import React, { useMemo } from "react";
import isEqual from "../../utils/isEqual";
import LanguageModelMenuDialog from "../model_menu/LanguageModelMenuDialog";
import type {
  LanguageModelValue,
  ModelPack,
  UnifiedModel
} from "../../stores/ApiTypes";
import { useLanguageModelsByProvider } from "../../hooks/useModelsByProvider";
import ModelSelectButton from "./shared/ModelSelectButton";
import useModelSelectMenu from "./shared/useModelSelectMenu";

interface LanguageModelSelectProps {
  onChange: (value: LanguageModelValue) => void;
  value: string;
  /** Provider of the selected model. Disambiguates an id several providers serve. */
  provider?: string;
  allowedProviders?: string[];
  /**
   * Hide models the provider declares as non-tool-capable. Pass `true` from
   * contexts that need function calling.
   */
  requireToolSupport?: boolean;
  /** Button label when nothing is selected. Defaults to "Select Model". */
  placeholder?: string;
  recommendedModels?: UnifiedModel[];
  modelPacks?: ModelPack[];
}

const LanguageModelSelect: React.FC<LanguageModelSelectProps> = ({
  onChange,
  value,
  provider,
  allowedProviders,
  requireToolSupport,
  placeholder = "Select Model",
  recommendedModels,
  modelPacks
}) => {
  const { anchorEl, buttonRef, handleClick, handleClose, handleSelect } =
    useModelSelectMenu("language_model", onChange);

  const { models: fetchedModels } = useLanguageModelsByProvider({
    allowedProviders
  });

  const currentSelectedModelDetails = useMemo(() => {
    if (!fetchedModels || !value) { return null; }
    const matches = fetchedModels.filter((m) => m.id === value);
    if (provider) {
      const exact = matches.find((m) => m.provider === provider);
      if (exact) { return exact; }
    }
    return matches[0] ?? null;
  }, [fetchedModels, value, provider]);

  return (
    <>
      <ModelSelectButton
        ref={buttonRef}
        active={!!value}
        label={currentSelectedModelDetails?.name || value || placeholder}
        secondaryLabel={currentSelectedModelDetails?.provider}
        subLabel={placeholder}
        onClick={handleClick}
      />
      <LanguageModelMenuDialog
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={handleClose}
        onModelChange={handleSelect}
        allowedProviders={allowedProviders}
        requireToolSupport={requireToolSupport}
        recommendedModels={recommendedModels}
        modelPacks={modelPacks}
      />
    </>
  );
};

export default React.memo(LanguageModelSelect, isEqual);

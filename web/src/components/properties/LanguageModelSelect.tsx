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
import { getProviderDisplayName } from "../../utils/providerDisplay";
import { useProviderKeyMissing } from "../../hooks/useProviderKeyMissing";
import { missingKeyWarning } from "./shared/missingKeyWarning";

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
  /** Button label when nothing is selected. Defaults to "Select model". */
  placeholder?: string;
  recommendedModels?: UnifiedModel[];
  modelPacks?: ModelPack[];
  disabled?: boolean;
}

const LanguageModelSelect: React.FC<LanguageModelSelectProps> = ({
  onChange,
  value,
  provider,
  allowedProviders,
  requireToolSupport,
  placeholder = "Select model",
  recommendedModels,
  modelPacks,
  disabled
}) => {
  const { anchorEl, buttonRef, handleClick, handleClose, handleSelect } =
    useModelSelectMenu("language_model", onChange);

  const { models: fetchedModels } = useLanguageModelsByProvider({
    allowedProviders
  });

  const currentSelectedModelDetails = useMemo(() => {
    if (!fetchedModels || !value) {
      return null;
    }
    return fetchedModels.find(
      (m) => m.id === value && (!provider || m.provider === provider)
    ) ?? null;
  }, [fetchedModels, value, provider]);

  // A model whose provider is not set up is missing from the fetched list,
  // so the field falls back to the provider stored with the value.
  const selectedProvider = currentSelectedModelDetails?.provider ?? provider;
  const missingKey = useProviderKeyMissing(value ? selectedProvider : undefined);

  const selectedModel = useMemo(
    () => (value ? { id: value, provider } : undefined),
    [value, provider]
  );

  return (
    <>
      <ModelSelectButton
        ref={buttonRef}
        active={!!value}
        label={currentSelectedModelDetails?.name || value || placeholder}
        secondaryLabel={getProviderDisplayName(selectedProvider)}
        warning={
          missingKey ? missingKeyWarning(selectedProvider, missingKey) : undefined
        }
        subLabel={placeholder}
        onClick={handleClick}
        disabled={disabled}
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
        selectedModel={selectedModel}
      />
    </>
  );
};

export default React.memo(LanguageModelSelect, isEqual);

import { memo } from "react";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { LanguageModel, ModelPack, UnifiedModel } from "../../stores/ApiTypes";
import { useLanguageModelMenuStore } from "../../stores/ModelMenuStore";
import { useLanguageModelsByProvider } from "../../hooks/useModelsByProvider";

interface LanguageModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  onModelChange?: (model: LanguageModel) => void;
  allowedProviders?: string[];
  /**
   * Hide models the provider declares as non-tool-capable
   * (`supports_tools === false`). Pass `true` from contexts that need
   * function calling (e.g. agent mode).
   */
  requireToolSupport?: boolean;
  anchorEl?: HTMLElement | null;
  recommendedModels?: UnifiedModel[];
  modelPacks?: ModelPack[];
  /** The model the control holds now. Its row is marked in the list. */
  selectedModel?: { id: string; provider?: string };
}

function LanguageModelMenuDialog({
  open,
  onClose,
  onModelChange,
  allowedProviders,
  requireToolSupport,
  anchorEl,
  recommendedModels,
  modelPacks,
  selectedModel
}: LanguageModelMenuDialogProps) {
  const modelData = useLanguageModelsByProvider({
    allowedProviders,
    requireToolSupport
  });
  return (
    <ModelMenuDialogBase<LanguageModel>
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      modelData={modelData}
      onModelChange={onModelChange}
      title="Select language model"
      searchPlaceholder="Search language models"
      storeHook={useLanguageModelMenuStore}
      modelType="language_model"
      recommendedModels={recommendedModels}
      modelPacks={modelPacks}
      selectedModel={selectedModel}
      promptForApiKey
    />
  );
}

export default memo(LanguageModelMenuDialog);


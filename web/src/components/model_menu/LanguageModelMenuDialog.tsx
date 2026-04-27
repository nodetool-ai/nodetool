import { memo } from "react";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { LanguageModel, ModelPack, UnifiedModel } from "../../stores/ApiTypes";
import { useLanguageModelMenuStore } from "../../stores/ModelMenuStore";
import { useLanguageModelsByProvider } from "../../hooks/useModelsByProvider";

export interface LanguageModelMenuDialogProps {
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
}

function LanguageModelMenuDialog({
  open,
  onClose,
  onModelChange,
  allowedProviders,
  requireToolSupport,
  anchorEl,
  recommendedModels,
  modelPacks
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
      title="Select Language Model"
      searchPlaceholder="Search language models..."
      storeHook={useLanguageModelMenuStore}
      recommendedModels={recommendedModels}
      modelPacks={modelPacks}
    />
  );
}

export default memo(LanguageModelMenuDialog);


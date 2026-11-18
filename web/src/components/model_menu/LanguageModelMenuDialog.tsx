import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { agentModelFit } from "@nodetool-ai/protocol";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { ModelRowBadge } from "./ModelList";
import type { LanguageModel, ModelPack, UnifiedModel } from "../../stores/ApiTypes";
import { useLanguageModelMenuStore } from "../../stores/ModelMenuStore";
import { useLanguageModelsByProvider } from "../../hooks/useModelsByProvider";

/** The provider capability this picker serves, for local providers to install. */
const LOCAL_CAPABILITIES = ["generate_message"];

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
  const { t } = useTranslation();
  const modelData = useLanguageModelsByProvider({
    allowedProviders,
    requireToolSupport
  });
  // Says on each row whether an agent can use the model, so a model that
  // cannot call tools or is rate limited is not found out by a failed run.
  const rowBadge = useCallback(
    (model: LanguageModel): ModelRowBadge | null => {
      switch (agentModelFit(model)) {
        case "no_tools":
          return {
            label: t("screen_modelMenu.agentFit.noToolsLabel"),
            tooltip: t("screen_modelMenu.agentFit.noToolsTooltip"),
            color: "default"
          };
        case "free_tier":
          return {
            label: t("screen_modelMenu.agentFit.freeTierLabel"),
            tooltip: t("screen_modelMenu.agentFit.freeTierTooltip"),
            color: "warning"
          };
        case "default":
          return {
            label: t("screen_modelMenu.agentFit.defaultLabel"),
            tooltip: t("screen_modelMenu.agentFit.defaultTooltip"),
            color: "success"
          };
        case "unknown":
          return null;
      }
    },
    [t]
  );
  return (
    <ModelMenuDialogBase<LanguageModel>
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      modelData={modelData}
      onModelChange={onModelChange}
      title={t("screen_modelMenu.selectLanguageModel")}
      searchPlaceholder={t("screen_modelMenu.searchLanguageModels")}
      storeHook={useLanguageModelMenuStore}
      modelType="language_model"
      localCapabilities={LOCAL_CAPABILITIES}
      recommendedModels={recommendedModels}
      modelPacks={modelPacks}
      selectedModel={selectedModel}
      promptForApiKey
      rowBadge={rowBadge}
    />
  );
}

export default memo(LanguageModelMenuDialog);


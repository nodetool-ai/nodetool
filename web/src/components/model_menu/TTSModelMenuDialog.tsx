import React from "react";
import { useTranslation } from "react-i18next";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import { useAllowedProviderModels } from "../../hooks/useAllowedProviderModels";
import type { ModelPack, TTSModel, UnifiedModel } from "../../stores/ApiTypes";
import {
  useTTSModelMenuStore
} from "../../stores/ModelMenuStore";
import { useTTSModelsByProvider } from "../../hooks/useModelsByProvider";

/** The provider capability this picker serves, for local providers to install. */
const LOCAL_CAPABILITIES = ["text_to_speech"];

interface TTSModelMenuDialogProps {
  /** Only these providers' models are listed. */
  allowedProviders?: string[];
  open: boolean;
  onClose: () => void;
  onModelChange?: (model: TTSModel) => void;
  anchorEl?: HTMLElement | null;
  recommendedModels?: UnifiedModel[];
  modelPacks?: ModelPack[];
}

function TTSModelMenuDialog({
  allowedProviders,
  open,
  onClose,
  onModelChange,
  anchorEl,
  recommendedModels,
  modelPacks
}: TTSModelMenuDialogProps) {
  const { t } = useTranslation();
  const modelData = useAllowedProviderModels(
    useTTSModelsByProvider(),
    allowedProviders
  );
  return (
    <ModelMenuDialogBase<TTSModel>
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      modelData={modelData}
      onModelChange={onModelChange}
      title={t("screen_modelMenu.selectTTSModel")}
      searchPlaceholder={t("screen_modelMenu.searchTTSModels")}
      storeHook={useTTSModelMenuStore}
      modelType="tts_model"
      localCapabilities={LOCAL_CAPABILITIES}
      recommendedModels={recommendedModels}
      modelPacks={modelPacks}
    />
  );
}

export default React.memo(TTSModelMenuDialog);

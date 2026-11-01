import React from "react";
import { useTranslation } from "react-i18next";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import { useAllowedProviderModels } from "../../hooks/useAllowedProviderModels";
import type { ModelPack, UnifiedModel, VideoModel } from "../../stores/ApiTypes";
import {
  useVideoModelMenuStore
} from "../../stores/ModelMenuStore";
import {
  useVideoModelsByProvider,
  type VideoModelTask
} from "../../hooks/useModelsByProvider";

interface VideoModelMenuDialogProps {
  /** Only these providers' models are listed. */
  allowedProviders?: string[];
  open: boolean;
  onClose: () => void;
  onModelChange?: (model: VideoModel) => void;
  task?: VideoModelTask | VideoModelTask[];
  anchorEl?: HTMLElement | null;
  recommendedModels?: UnifiedModel[];
  modelPacks?: ModelPack[];
}

function VideoModelMenuDialog({
  allowedProviders,
  open,
  onClose,
  onModelChange,
  task,
  anchorEl,
  recommendedModels,
  modelPacks
}: VideoModelMenuDialogProps) {
  const { t } = useTranslation();
  const modelData = useAllowedProviderModels(
    useVideoModelsByProvider({ task }),
    allowedProviders
  );
  return (
    <ModelMenuDialogBase<VideoModel>
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      modelData={modelData}
      onModelChange={onModelChange}
      title={t("screen_modelMenu.selectVideoModel")}
      searchPlaceholder={t("screen_modelMenu.searchTextToVideoModels")}
      storeHook={useVideoModelMenuStore}
      modelType="video_model"
      recommendedModels={recommendedModels}
      modelPacks={modelPacks}
    />
  );
}

export default React.memo(VideoModelMenuDialog);

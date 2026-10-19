import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { ImageModel, ModelPack, UnifiedModel } from "../../stores/ApiTypes";
import { useImageModelMenuStore } from "../../stores/ModelMenuStore";
import { imageTaskCapabilities } from "../../hooks/useProviders";
import {
  useImageModelsByProvider,
  type ImageModelTask
} from "../../hooks/useModelsByProvider";

interface ImageModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  onModelChange?: (model: ImageModel) => void;
  task?: ImageModelTask | ImageModelTask[];
  anchorEl?: HTMLElement | null;
  recommendedModels?: UnifiedModel[];
  modelPacks?: ModelPack[];
  /** The model the control holds now. Its row is marked in the list. */
  selectedModel?: { id: string; provider?: string };
}

function ImageModelMenuDialog({
  open,
  onClose,
  onModelChange,
  task,
  anchorEl,
  recommendedModels,
  modelPacks,
  selectedModel
}: ImageModelMenuDialogProps) {
  const { t } = useTranslation();
  const modelData = useImageModelsByProvider({ task });
  const localCapabilities = useMemo(
    () => imageTaskCapabilities(task === undefined ? undefined : [task].flat()),
    [task]
  );
  return (
    <ModelMenuDialogBase<ImageModel>
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      modelData={modelData}
      onModelChange={onModelChange}
      title={t("screen_modelMenu.selectImageModel")}
      searchPlaceholder={t("screen_modelMenu.searchImageModels")}
      storeHook={useImageModelMenuStore}
      modelType="image_model"
      localCapabilities={localCapabilities}
      recommendedModels={recommendedModels}
      modelPacks={modelPacks}
      selectedModel={selectedModel}
      promptForApiKey
    />
  );
}

export default memo(ImageModelMenuDialog);

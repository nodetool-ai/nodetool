import React from "react";
import { useTranslation } from "react-i18next";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { MusicModel, ModelPack, UnifiedModel } from "../../stores/ApiTypes";
import { useMusicModelMenuStore } from "../../stores/ModelMenuStore";
import { useMusicModelsByProvider } from "../../hooks/useModelsByProvider";

/** The provider capability this picker serves, for local providers to install. */
const LOCAL_CAPABILITIES = ["text_to_music"];

interface MusicModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  onModelChange?: (model: MusicModel) => void;
  anchorEl?: HTMLElement | null;
  recommendedModels?: UnifiedModel[];
  modelPacks?: ModelPack[];
}

function MusicModelMenuDialog({
  open,
  onClose,
  onModelChange,
  anchorEl,
  recommendedModels,
  modelPacks
}: MusicModelMenuDialogProps) {
  const { t } = useTranslation();
  const modelData = useMusicModelsByProvider();
  return (
    <ModelMenuDialogBase<MusicModel>
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      modelData={modelData}
      onModelChange={onModelChange}
      title={t("screen_modelMenu.selectMusicModel")}
      searchPlaceholder={t("screen_modelMenu.searchTextToMusicModels")}
      storeHook={useMusicModelMenuStore}
      modelType="music_model"
      localCapabilities={LOCAL_CAPABILITIES}
      recommendedModels={recommendedModels}
      modelPacks={modelPacks}
    />
  );
}

export default React.memo(MusicModelMenuDialog);

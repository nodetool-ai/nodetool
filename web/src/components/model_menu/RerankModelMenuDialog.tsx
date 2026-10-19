import { memo } from "react";
import { useTranslation } from "react-i18next";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { RerankModel } from "../../stores/ApiTypes";
import { useRerankModelsByProvider } from "../../hooks/useRerankModels";
import { useRerankModelMenuStore } from "../../stores/ModelMenuStore";

/** The provider capability this picker serves, for local providers to install. */
const LOCAL_CAPABILITIES = ["rerank"];

interface RerankModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  onModelChange?: (model: RerankModel) => void;
  anchorEl?: HTMLElement | null;
}

function RerankModelMenuDialog({
  open,
  onClose,
  onModelChange,
  anchorEl
}: RerankModelMenuDialogProps) {
  const { t } = useTranslation();
  const modelData = useRerankModelsByProvider();
  return (
    <ModelMenuDialogBase<RerankModel>
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      modelData={modelData}
      onModelChange={onModelChange}
      title={t("screen_modelMenu.selectRerankModel")}
      searchPlaceholder={t("screen_modelMenu.searchRerankModels")}
      storeHook={useRerankModelMenuStore}
      modelType="rerank_model"
      localCapabilities={LOCAL_CAPABILITIES}
    />
  );
}

export default memo(RerankModelMenuDialog);

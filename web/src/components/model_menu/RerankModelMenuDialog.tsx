import { memo } from "react";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { RerankModel } from "../../stores/ApiTypes";
import { useRerankModelsByProvider } from "../../hooks/useRerankModels";
import { useRerankModelMenuStore } from "../../stores/ModelMenuStore";

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
  const modelData = useRerankModelsByProvider();
  return (
    <ModelMenuDialogBase<RerankModel>
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      modelData={modelData}
      onModelChange={onModelChange}
      title="Select Rerank Model"
      searchPlaceholder="Search reranking models..."
      storeHook={useRerankModelMenuStore}
      modelType="rerank_model"
    />
  );
}

export default memo(RerankModelMenuDialog);

import React from "react";
import { useQuery } from "@tanstack/react-query";
import ModelMenuDialogBase from "./shared/ModelMenuDialogBase";
import type { ASRModel, ModelPack, UnifiedModel } from "../../stores/ApiTypes";
import {
  useASRModelMenuStore
} from "../../stores/ModelMenuStore";
import { useASRModelsByProvider } from "../../hooks/useModelsByProvider";
import { trpc } from "../../lib/trpc";

interface ASRModelMenuDialogProps {
  open: boolean;
  onClose: () => void;
  onModelChange?: (model: ASRModel) => void;
  anchorEl?: HTMLElement | null;
  recommendedModels?: UnifiedModel[];
  modelPacks?: ModelPack[];
}

function ASRModelMenuDialog({
  open,
  onClose,
  onModelChange,
  anchorEl,
  recommendedModels: recommendedModelsFromProps,
  modelPacks
}: ASRModelMenuDialogProps) {
  const modelData = useASRModelsByProvider();
  // Local providers such as whisper.cpp list only the files on disk. Without
  // the recommended list a caller that passes none offers nothing to download.
  const needsFallback =
    !recommendedModelsFromProps || recommendedModelsFromProps.length === 0;
  const { data: recommendedModelsFallback } = useQuery<UnifiedModel[]>({
    queryKey: ["recommended-task-models", "recommendedAsr"],
    enabled: open && needsFallback,
    queryFn: () => trpc.models.recommendedAsr.query(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false
  });
  const recommendedModels = needsFallback
    ? recommendedModelsFallback
    : recommendedModelsFromProps;
  return (
    <ModelMenuDialogBase<ASRModel>
      open={open}
      anchorEl={anchorEl}
      onClose={onClose}
      modelData={modelData}
      onModelChange={onModelChange}
      title="Select ASR Model"
      searchPlaceholder="Search speech-to-text models..."
      storeHook={useASRModelMenuStore}
      modelType="asr_model"
      recommendedModels={recommendedModels}
      modelPacks={modelPacks}
    />
  );
}

export default React.memo(ASRModelMenuDialog);
